from sqlalchemy import Column, Integer, String, Text
from app.database import Base

class MeetingDB(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text)
    summary = Column(Text)
