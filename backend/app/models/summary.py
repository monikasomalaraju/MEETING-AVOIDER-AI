from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class SummaryDB(Base):
    """
    Structured AI-generated summary for a TranscriptDB.
    List-type fields (key_points, action_items, decisions, deadlines, risks,
    next_steps, keywords) are stored as newline-separated text (kept simple
    to match the project's existing SQLite/text style) and are split into
    lists by the API layer before returning to the client.
    """
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True)

    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=False, unique=True)

    executive_summary = Column(Text, nullable=True)   # 1-3 sentence high-level outcome
    outcome = Column(Text, nullable=True)               # single-line TL;DR outcome
    overall_summary = Column(Text, nullable=True)      # detailed summary
    key_points = Column(Text, nullable=True)
    action_items = Column(Text, nullable=True)
    decisions = Column(Text, nullable=True)
    deadlines = Column(Text, nullable=True)
    risks = Column(Text, nullable=True)                # risks & blockers
    next_steps = Column(Text, nullable=True)
    keywords = Column(Text, nullable=True)
    category = Column(Text, nullable=True)              # Project / Client / HR / Academic / Other

    created_at = Column(DateTime, default=datetime.utcnow)

    transcript = relationship("TranscriptDB", back_populates="summary")
