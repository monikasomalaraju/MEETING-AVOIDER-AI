from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class MeetingCreate(BaseModel):
    title: str
    date: str
    time: str
    link: str
    text: Optional[str] = None

class MeetingOut(BaseModel):
    id: int
    user_id: int
    title: str
    date: str
    time: str
    link: str
    summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class MeetingSummarize(BaseModel):
    text: str