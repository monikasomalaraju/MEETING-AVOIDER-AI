from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SummaryOut(BaseModel):
    id: int
    executive_summary: Optional[str] = None
    outcome: Optional[str] = None
    overall_summary: Optional[str] = None
    key_points: List[str] = []
    action_items: List[str] = []
    decisions: List[str] = []
    deadlines: List[str] = []
    risks: List[str] = []
    next_steps: List[str] = []
    keywords: List[str] = []
    category: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TranscriptOut(BaseModel):
    id: int
    user_id: int
    meeting_id: Optional[int] = None
    title: str
    meeting_date: Optional[str] = None
    participants: Optional[str] = None
    duration: Optional[str] = None
    source_type: str
    original_filename: Optional[str] = None
    raw_text: str
    created_at: datetime
    summary: Optional[SummaryOut] = None

    class Config:
        from_attributes = True


class TranscriptListItem(BaseModel):
    """Lightweight version used for history lists — carries enough for a
    compact card (counts + a short preview) without the full transcript/
    summary body, so the history page stays cheap to load."""
    id: int
    title: str
    meeting_date: Optional[str] = None
    duration: Optional[str] = None
    participants: Optional[str] = None
    source_type: str
    created_at: datetime
    has_summary: bool
    category: Optional[str] = None
    preview: Optional[str] = None
    action_items_count: int = 0
    decisions_count: int = 0
    deadlines_count: int = 0

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    answer: str
