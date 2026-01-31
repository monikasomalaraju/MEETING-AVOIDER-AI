from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas.meeting import Meeting
from app.database import SessionLocal
from app.models.meeting import MeetingDB

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/summarize")
def summarize(meeting: Meeting, db: Session = Depends(get_db)):
    summary = meeting.text[:100] + "..."

    meeting_db = MeetingDB(
        text=meeting.text,
        summary=summary
    )
    db.add(meeting_db)
    db.commit()
    db.refresh(meeting_db)

    return {
        "summary": summary,
        "length": len(meeting.text)
    }
