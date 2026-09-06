"""
Lightweight meeting-reminder scheduler.

Design choice: this project doesn't need a heavyweight job queue
(Celery/APScheduler/etc.) for a single-process academic deployment - an
in-process asyncio loop that polls every 60 seconds is simple, has zero
new dependencies, and is easy to explain/demonstrate. If this app were
ever deployed with multiple worker processes, this approach would send
duplicate reminders (each worker polls independently) - documented as a
known limitation rather than hidden.

How duplicate reminders are avoided within a single process, including
across server restarts: MeetingDB.reminder_sent is a persisted column,
checked and set in the same pass, so a meeting is only ever reminded once
even if the server restarts between the meeting being created and its
reminder time.

Time zones: meeting.date/time are stored as plain strings with no time
zone information (matching the rest of this project - there is no
per-user time zone setting anywhere in the schema). Reminders therefore
compare against the SERVER's local time. This is a known, documented
simplification, not a hidden bug.
"""

import asyncio
import logging
import os
from datetime import datetime

from app.database import SessionLocal
from app.models.meeting import MeetingDB
from app.models.user import User
from app.services.email_service import send_meeting_reminder

logger = logging.getLogger("meeting_avoider.reminders")

POLL_INTERVAL_SECONDS = 60
REMINDER_WINDOW_MINUTES = (9, 11)  # send when 9-11 minutes remain (covers the 60s poll gap)
_test_seconds = os.getenv("REMINDER_TEST_SECONDS")
_test_minutes = os.getenv("REMINDER_TEST_MINUTES")
try:
    TEST_DELAY_SECONDS = int(_test_seconds) if _test_seconds else None
    if TEST_DELAY_SECONDS is None and _test_minutes:
        TEST_DELAY_SECONDS = int(float(_test_minutes) * 60)
    if TEST_DELAY_SECONDS is not None and TEST_DELAY_SECONDS <= 0:
        TEST_DELAY_SECONDS = None
except ValueError:
    logger.warning("Invalid REMINDER_TEST_SECONDS/REMINDER_TEST_MINUTES; using normal 10-minute reminders.")
    TEST_DELAY_SECONDS = None

if TEST_DELAY_SECONDS is not None:
    POLL_INTERVAL_SECONDS = min(5, max(1, TEST_DELAY_SECONDS // 3 or 1))


def _reminder_window_seconds() -> tuple[int, int]:
    if TEST_DELAY_SECONDS is not None:
        # A short polling interval gives the test mode a useful catch window.
        return max(0, TEST_DELAY_SECONDS - POLL_INTERVAL_SECONDS), TEST_DELAY_SECONDS + 1
    return 9 * 60, 11 * 60


def _parse_meeting_datetime(meeting: MeetingDB):
    """
    Returns a datetime or None if the stored date/time can't be parsed
    (e.g. left blank, or in an unexpected format from an older record).
    Never raises - a single bad row must not crash the whole scheduler.
    """
    if not meeting.date or not meeting.time:
        return None
    value = f"{meeting.date} {meeting.time}"
    for time_format in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value, time_format)
        except ValueError:
            continue
    logger.warning(
        "Meeting id=%s has an unparseable date/time (%r, %r) - skipping for reminders.",
        meeting.id, meeting.date, meeting.time,
    )
    return None


def check_and_send_reminders() -> int:
    """
    One polling pass: finds meetings starting in ~10 minutes that haven't
    been reminded yet, sends the email, and marks them as reminded.
    Returns the number of reminders sent (for logging/testing).
    """
    db = SessionLocal()
    sent_count = 0
    try:
        logger.info("Checking upcoming meetings")
        candidates = db.query(MeetingDB).filter(MeetingDB.reminder_sent.is_(False)).all()
        now = datetime.now()
        window_start, window_end = _reminder_window_seconds()

        for meeting in candidates:
            meeting_dt = _parse_meeting_datetime(meeting)
            if not meeting_dt:
                continue

            seconds_until = (meeting_dt - now).total_seconds()

            # Already passed (or long past) - mark as "handled" so we stop
            # re-checking it forever, without pretending a reminder was sent.
            if seconds_until < 0:
                meeting.reminder_sent = True
                db.commit()
                continue

            if window_start <= seconds_until <= window_end:
                user = db.query(User).filter(User.id == meeting.user_id).first()
                if not user or not user.email:
                    logger.warning("Reminder skipped for meeting: %s because the user has no email address.", meeting.title)
                    meeting.reminder_sent = True
                    db.commit()
                    continue

                logger.info("Reminder due for meeting: %s", meeting.title)
                sent = send_meeting_reminder(user.email, user.name, meeting)
                if sent:
                    meeting.reminder_sent = True
                    db.commit()
                    sent_count += 1
                else:
                    db.rollback()

        return sent_count
    finally:
        db.close()


async def reminder_loop():
    """Runs forever in the background, started once at app startup."""
    mode = f"test mode: {TEST_DELAY_SECONDS}s before meeting" if TEST_DELAY_SECONDS else "normal mode: 10 minutes before meeting"
    logger.info("Reminder scheduler started (%s, polling every %ss).", mode, POLL_INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.to_thread(check_and_send_reminders)
        except Exception as e:
            # A single bad polling pass should never kill the background loop.
            logger.error("Reminder scheduler pass failed: %s", e)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
