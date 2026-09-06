from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    phone = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    department = Column(String, nullable=True)
    role = Column(String, nullable=True)
    bio = Column(Text, nullable=True)

    notify_email = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

    # Relationship with meetings
    meetings = relationship("MeetingDB", back_populates="user")