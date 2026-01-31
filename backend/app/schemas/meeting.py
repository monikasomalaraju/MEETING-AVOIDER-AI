from pydantic import BaseModel

class Meeting(BaseModel):
    text: str