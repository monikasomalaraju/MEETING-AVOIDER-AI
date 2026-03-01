from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.meeting import MeetingDB
from app.models.user import User
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingSummarize
from typing import List

router = APIRouter(prefix="/meetings", tags=["meetings"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=MeetingOut)
def create_meeting(meeting: MeetingCreate, user_id: int, db: Session = Depends(get_db)):
    """Create a new meeting for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    db_meeting = MeetingDB(
        user_id=user_id,
        title=meeting.title,
        date=meeting.date,
        time=meeting.time,
        link=meeting.link,
        text=meeting.text
    )
    db.add(db_meeting)
    db.commit()
    db.refresh(db_meeting)
    return db_meeting


@router.get("/{user_id}", response_model=List[MeetingOut])
def get_user_meetings(user_id: int, db: Session = Depends(get_db)):
    """Get all meetings for a specific user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    meetings = db.query(MeetingDB).filter(MeetingDB.user_id == user_id).all()
    return meetings


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: int, user_id: int, db: Session = Depends(get_db)):
    """Delete a meeting (only if it belongs to the user)"""
    meeting = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    
    if meeting.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    db.delete(meeting)
    db.commit()
    return {"message": "Meeting deleted"}


@router.post("/summarize")
def summarize_meeting(meeting: MeetingSummarize, db: Session = Depends(get_db)):
    """Generate a summary for meeting text"""
    summary = meeting.text[:100] + "..." if len(meeting.text) > 100 else meeting.text
    return {
        "summary": summary,
        "length": len(meeting.text)
    }
