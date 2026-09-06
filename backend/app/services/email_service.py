"""
Email reminder service.

Sends a "your meeting starts in ~10 minutes" email using plain smtplib
(stdlib only - no new dependency). Configuration comes entirely from
environment variables (see backend/.env.example) - nothing is hardcoded.

Behavior when SMTP isn't configured (e.g. a student running this locally
without a mail account): the app must NOT crash, and must NOT pretend an
email was sent. It logs a clear message and returns False so the caller
can decide what to do (the scheduler still marks the reminder as
"attempted" to avoid retry-spamming the logs every polling cycle).

NOTIFICATION_MODE=console is a safe dev/test mode: instead of actually
connecting to an SMTP server, the full email (subject + body) is printed
to the backend console, so the reminder workflow can be exercised without
real email credentials.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("meeting_avoider.email")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = os.getenv("SMTP_PORT")
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("FROM_EMAIL")
NOTIFICATION_MODE = os.getenv("NOTIFICATION_MODE", "").strip().lower()


def _is_smtp_configured() -> bool:
    return all([SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, FROM_EMAIL])


def build_reminder_email(user_name: str, meeting) -> tuple[str, str]:
    """Returns (subject, body) for a meeting reminder. `meeting` is a MeetingDB row."""
    subject = f"Meeting Reminder — {meeting.title}"

    body_lines = [
        f"Hello {user_name},",
        "",
        "Your meeting is scheduled in 10 minutes.",
        "",
        f"Meeting: {meeting.title}",
        f"Date: {meeting.date}",
        f"Time: {meeting.time}",
    ]
    if meeting.link:
        body_lines.append(f"Meeting Link: {meeting.link}")
    if meeting.participants:
        body_lines.append(f"Participants: {meeting.participants}")
    body_lines += ["", "Please join on time.", "", "Regards,", "Meeting Avoider AI"]

    return subject, "\n".join(body_lines)


def send_meeting_reminder(to_email: str, user_name: str, meeting) -> bool:
    """
    Sends the reminder email. Returns True only if it was actually sent
    (or, in console dev mode, actually printed). Never raises - a failed
    or unconfigured email must never crash the reminder scheduler or the
    rest of the app.
    """
    subject, body = build_reminder_email(user_name, meeting)

    if NOTIFICATION_MODE == "console":
        logger.info("Sending reminder to: %s", to_email)
        print("\n" + "=" * 60)
        print("[DEV MODE - NOTIFICATION_MODE=console] Email NOT actually sent.")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print("-" * 60)
        print(body)
        print("=" * 60 + "\n")
        logger.info("Reminder sent successfully (console test mode) for meeting: %s", meeting.title)
        return True

    if not _is_smtp_configured():
        logger.warning(
            "Email reminder skipped for '%s' (%s): SMTP is not configured. "
            "Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, FROM_EMAIL "
            "in backend/.env, or set NOTIFICATION_MODE=console for local testing.",
            meeting.title, to_email,
        )
        return False

    try:
        logger.info("Sending reminder to: %s", to_email)
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email

        with smtplib.SMTP(SMTP_HOST, int(SMTP_PORT), timeout=10) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())

        logger.info("Reminder sent successfully for meeting: %s", meeting.title)
        return True

    except Exception as e:
        # Never let an email failure take down the scheduler or the app.
        logger.error("Reminder failed for meeting: %s: %s", meeting.title, e)
        return False
