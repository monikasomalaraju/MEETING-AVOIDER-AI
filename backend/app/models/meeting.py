from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class MeetingDB(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    title = Column(String, nullable=False)
    date = Column(String, nullable=False)
    time = Column(String, nullable=False)

    link = Column(String, nullable=True)
    participants = Column(String, nullable=True)

    text = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)

    reminder_sent = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="meetings")