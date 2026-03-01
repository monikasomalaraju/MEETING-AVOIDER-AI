from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    name: str = None
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str = None
    email: EmailStr

    class Config:
        from_attributes = True
