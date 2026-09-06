from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class TranscriptDB(Base):
    """
    Raw meeting transcript captured from the Meeting Summarization page.
    Can optionally be linked to an existing scheduled meeting (MeetingDB),
    or stand alone if the user just wants to summarize an ad-hoc transcript.
    """
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=True)

    title = Column(String, nullable=False)
    meeting_date = Column(String, nullable=True)
    participants = Column(String, nullable=True)  # comma-separated names
    duration = Column(String, nullable=True)       # free-text, e.g. "45 min"

    source_type = Column(String, nullable=False, default="text")  # "text" | "audio"
    original_filename = Column(String, nullable=True)

    raw_text = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    meeting = relationship("MeetingDB")
    summary = relationship(
        "SummaryDB",
        back_populates="transcript",
        uselist=False,
        cascade="all, delete-orphan"
    )
