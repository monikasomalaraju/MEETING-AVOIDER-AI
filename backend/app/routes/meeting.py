from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.meeting import MeetingDB
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingSummarize
from typing import List

from app.services.ai_summary import generate_summary

router = APIRouter(prefix="/meetings", tags=["meetings"])


# ✅ CREATE MEETING (AUTO SUMMARY ADDED)
@router.post("/", response_model=MeetingOut)
def create_meeting(meeting: MeetingCreate, db: Session = Depends(get_db)):
    print("Meeting type:", type(meeting))
    print("Meeting data:", meeting.model_dump())
    
    user = db.query(User).filter(
        User.id == meeting.user_id
    ).first()
      
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ✅ Limit text size
    MAX_LENGTH = 3000
    text = (meeting.text or "").strip()[:MAX_LENGTH]

    # ✅ Auto-generate summary only if text exists
    summary = None
    if text:
        try:
            summary = generate_summary(text)
        except:
            summary = "Summary could not be generated"

    db_meeting = MeetingDB(
        user_id=meeting.user_id,
        title=meeting.title,
        date=meeting.date,
        time=meeting.time,
        link=meeting.link,
        participants=meeting.participants,
        text=meeting.text,
        summary=summary
    )

    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)

    return db_meeting


# ✅ GET USER MEETINGS
@router.get("/{user_id}", response_model=List[MeetingOut])
def get_user_meetings(user_id: int, db: Session = Depends(get_db)):

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    meetings = db.query(MeetingDB).filter(
        MeetingDB.user_id == user_id
    ).all()

    return meetings


# ✅ DELETE MEETING
@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: int, user_id: int, db: Session = Depends(get_db)):
    meeting = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()

    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if meeting.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(meeting)
    db.commit()

    return {"message": "Meeting deleted"}


# ✅ OPTIONAL MANUAL SUMMARIZE (SAFE VERSION)
@router.post("/summarize")
def summarize_meeting(meeting: MeetingSummarize, db: Session = Depends(get_db)):

    db_meeting = db.query(MeetingDB).filter(MeetingDB.id == meeting.meeting_id).first()

    if not db_meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # ✅ Avoid duplicate generation
    if db_meeting.summary:
        return {
            "message": "Summary already exists",
            "meeting_id": db_meeting.id,
            "summary": db_meeting.summary
        }

    MAX_LENGTH = 3000
    text = (meeting.text or "").strip()[:MAX_LENGTH]

    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    try:
        summary = generate_summary(text)
    except:
        summary = "Summary could not be generated"

    db_meeting.text = meeting.text
    db_meeting.summary = summary

    db.commit()
    db.refresh(db_meeting)

    return {
        "message": "Summary generated successfully",
        "meeting_id": db_meeting.id,
        "summary": db_meeting.summary
    }

@router.put("/{meeting_id}")
def update_meeting(
    meeting_id: int,
    meeting: MeetingCreate,
    db: Session = Depends(get_db)
):

    db_meeting = (
        db.query(MeetingDB)
        .filter(MeetingDB.id == meeting_id)
        .first()
    )

    if not db_meeting:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found"
        )

    db_meeting.title = meeting.title
    db_meeting.date = meeting.date
    db_meeting.time = meeting.time
    db_meeting.link = meeting.link
    db_meeting.participants = meeting.participants
    db_meeting.updated_at = datetime.utcnow()

    db.commit()

    return {
        "message":"Meeting updated"
    }