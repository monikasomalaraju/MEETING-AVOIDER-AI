from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True


class UserProfileOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    bio: Optional[str] = None
    notify_email: bool = True
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    bio: Optional[str] = None
    notify_email: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserStatsOut(BaseModel):
    total_meetings: int
    upcoming_meetings: int
    past_meetings: int
    summaries_generated: int
    action_items_count: int
