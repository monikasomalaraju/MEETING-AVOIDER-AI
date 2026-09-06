from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MeetingCreate(BaseModel):
    user_id: int
    title: str
    date: str
    time: str
    link: str 
    participants: Optional[str] = None
    text: str = ""

class MeetingOut(BaseModel):
    id: int
    user_id: int
    title: str
    date: str
    time: str
    link: Optional[str] = None
    participants: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class MeetingSummarize(BaseModel):
    text: str
    meeting_id: int
