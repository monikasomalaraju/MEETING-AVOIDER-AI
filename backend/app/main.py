from fastapi import FastAPI
from app.routes import meeting

app = FastAPI(title="Meeting Avoider AI")

app.include_router(meeting.router)

@app.get("/")
def home():
    return {"message": "Backend running"}
