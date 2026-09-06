from datetime import datetime
from collections import Counter
from typing import Optional, List
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.database import get_db
from app.models.user import User
from app.models.meeting import MeetingDB
from app.models.transcript import TranscriptDB
from app.models.summary import SummaryDB
from app.schemas.user import UserProfileOut, UserProfileUpdate, ChangePasswordRequest, UserStatsOut

router = APIRouter(prefix="/users", tags=["users"])

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def _get_user_or_404(user_id: int, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{user_id}/profile", response_model=UserProfileOut)
def get_profile(user_id: int, db: Session = Depends(get_db)):
    return _get_user_or_404(user_id, db)


@router.put("/{user_id}/profile", response_model=UserProfileOut)
def update_profile(user_id: int, payload: UserProfileUpdate, db: Session = Depends(get_db)):
    user = _get_user_or_404(user_id, db)

    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        user.name = payload.name.strip()

    for field in ("phone", "organization", "department", "role", "bio"):
        value = getattr(payload, field)
        if value is not None:
            setattr(user, field, value.strip())

    if payload.notify_email is not None:
        user.notify_email = payload.notify_email

    user.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/change-password")
def change_password(user_id: int, payload: ChangePasswordRequest, db: Session = Depends(get_db)):
    user = _get_user_or_404(user_id, db)

    if not pwd_context.verify(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    user.hashed_password = pwd_context.hash(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


def _lines(value: Optional[str]) -> List[str]:
    return [line.strip() for line in (value or "").split("\n") if line.strip()]


def _load_user_meeting_data(user_id: int, db: Session):
    """Shared base query used by both /stats and /dashboard, so the two
    endpoints can't silently drift out of sync with each other."""
    meetings = db.query(MeetingDB).filter(MeetingDB.user_id == user_id).all()
    transcripts = db.query(TranscriptDB).filter(TranscriptDB.user_id == user_id).all()

    summaries = (
        db.query(SummaryDB)
        .join(TranscriptDB, SummaryDB.transcript_id == TranscriptDB.id)
        .filter(TranscriptDB.user_id == user_id)
        .order_by(SummaryDB.created_at.desc())
        .all()
    )
    transcript_by_id = {t.id: t for t in transcripts}

    decisions_extracted = sum(len(_lines(s.decisions)) for s in summaries)
    action_items_count = sum(len(_lines(s.action_items)) for s in summaries)

    return {
        "meetings": meetings,
        "transcripts": transcripts,
        "summaries": summaries,
        "transcript_by_id": transcript_by_id,
        "decisions_extracted": decisions_extracted,
        "action_items_count": action_items_count,
    }


@router.get("/{user_id}/stats", response_model=UserStatsOut)
def get_stats(user_id: int, db: Session = Depends(get_db)):
    _get_user_or_404(user_id, db)

    today = datetime.now().strftime("%Y-%m-%d")
    data = _load_user_meeting_data(user_id, db)
    meetings = data["meetings"]

    return {
        "total_meetings": len(meetings),
        "upcoming_meetings": sum(1 for m in meetings if m.date >= today),
        "past_meetings": sum(1 for m in meetings if m.date < today),
        "summaries_generated": len(data["summaries"]),
        "action_items_count": data["action_items_count"],
    }


@router.get("/{user_id}/dashboard")
def get_dashboard(user_id: int, db: Session = Depends(get_db)):
    """
    One consolidated payload for the whole Dashboard page, instead of the
    frontend making 5+ separate calls and stitching them together. Every
    number here comes directly from stored data — nothing is fabricated;
    insights that can't be computed from the current dataset are returned
    as null and the frontend hides that card rather than showing a fake value.
    """
    user = _get_user_or_404(user_id, db)

    today_str = datetime.now().strftime("%Y-%m-%d")

    data = _load_user_meeting_data(user_id, db)
    meetings = data["meetings"]
    transcripts = data["transcripts"]
    summaries = data["summaries"]
    transcript_by_id = data["transcript_by_id"]
    decisions_extracted = data["decisions_extracted"]
    action_items_count = data["action_items_count"]

    total_meetings = len(meetings)
    upcoming_meetings = [m for m in meetings if m.date > today_str]
    completed_meetings = [m for m in meetings if m.date < today_str]
    todays_meetings = [m for m in meetings if m.date == today_str]

    transcript_by_meeting = {t.meeting_id: t.id for t in transcripts if t.meeting_id is not None}

    # ---- KPI cards ----
    kpis = {
        "total_meetings": total_meetings,
        "upcoming_meetings": len(upcoming_meetings),
        "completed_meetings": len(completed_meetings),
        "summaries_generated": len(summaries),
        "action_items_count": action_items_count,
        "decisions_extracted": decisions_extracted,
    }

    # ---- Today's meetings ----
    todays_meetings_out = [
        {
            "id": m.id,
            "title": m.title,
            "time": m.time,
            "participants": m.participants,
            "status": "Ongoing",
            "transcript_id": transcript_by_meeting.get(m.id),
        }
        for m in todays_meetings
    ]

    # ---- AI Insights (each hidden by the frontend if null) ----
    keyword_counter = Counter()
    category_counter = Counter()
    for s in summaries:
        for kw in _lines(s.keywords):
            keyword_counter[kw.lower()] += 1
        if s.category:
            category_counter[s.category] += 1

    most_discussed_topic = keyword_counter.most_common(1)[0][0] if keyword_counter else None
    most_frequent_category = category_counter.most_common(1)[0][0] if category_counter else None

    durations_minutes = []
    for t in transcripts:
        if t.duration:
            match = re.search(r"\d+", t.duration)
            if match:
                durations_minutes.append(int(match.group()))
    avg_duration_minutes = round(sum(durations_minutes) / len(durations_minutes)) if durations_minutes else None

    insights = {
        "most_discussed_topic": most_discussed_topic,
        "most_frequent_category": most_frequent_category,
        "avg_duration_minutes": avg_duration_minutes,
        "total_decisions": decisions_extracted,
        "total_action_items": action_items_count,
    }

    # ---- Action items to review (most recent first, capped) ----
    action_items_list = []
    for s in summaries:
        t = transcript_by_id.get(s.transcript_id)
        for line in _lines(s.action_items):
            action_items_list.append({
                "text": line,
                "meeting_title": t.title if t else "Unknown meeting",
                "transcript_id": s.transcript_id,
            })
    action_items_list = action_items_list[:8]

    # ---- Recent AI summaries ----
    recent_summaries = []
    for s in summaries[:5]:
        t = transcript_by_id.get(s.transcript_id)
        preview_source = s.overall_summary or s.executive_summary or ""
        preview = (preview_source[:140] + "…") if len(preview_source) > 140 else preview_source
        recent_summaries.append({
            "transcript_id": s.transcript_id,
            "title": t.title if t else "Untitled meeting",
            "meeting_date": t.meeting_date if t else None,
            "preview": preview or "No preview available.",
        })

    # ---- Activity timeline (only genuinely tracked events) ----
    events = []
    for m in meetings:
        if m.created_at:
            events.append({"type": "Meeting Created", "description": f'Meeting "{m.title}" was scheduled', "timestamp": m.created_at})
        if m.updated_at:
            events.append({"type": "Meeting Updated", "description": f'Meeting "{m.title}" was updated', "timestamp": m.updated_at})
    for t in transcripts:
        if t.created_at:
            events.append({"type": "Transcript Imported", "description": f'Transcript imported for "{t.title}"', "timestamp": t.created_at})
    for s in summaries:
        t = transcript_by_id.get(s.transcript_id)
        if s.created_at:
            events.append({"type": "Summary Generated", "description": f'AI summary generated for "{t.title if t else "a meeting"}"', "timestamp": s.created_at})
    if user.updated_at:
        events.append({"type": "Profile Updated", "description": "Profile information was updated", "timestamp": user.updated_at})

    events.sort(key=lambda e: e["timestamp"], reverse=True)
    activity_timeline = events[:10]

    return {
        "name": user.name,
        "today": today_str,
        "kpis": kpis,
        "todays_meetings": todays_meetings_out,
        "insights": insights,
        "action_items": action_items_list,
        "recent_summaries": recent_summaries,
        "activity_timeline": activity_timeline,
    }


@router.delete("/{user_id}")
def delete_account(user_id: int, db: Session = Depends(get_db)):
    user = _get_user_or_404(user_id, db)

    # SQLite foreign-key enforcement isn't enabled in this project (see
    # database.py), so cascading has to be done explicitly here or these
    # rows would be silently orphaned rather than rejected/cascaded.
    transcript_ids = [t.id for t in db.query(TranscriptDB.id).filter(TranscriptDB.user_id == user_id).all()]
    if transcript_ids:
        db.query(SummaryDB).filter(SummaryDB.transcript_id.in_(transcript_ids)).delete(synchronize_session=False)
    db.query(TranscriptDB).filter(TranscriptDB.user_id == user_id).delete(synchronize_session=False)
    db.query(MeetingDB).filter(MeetingDB.user_id == user_id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    return {"message": "Account deleted"}
