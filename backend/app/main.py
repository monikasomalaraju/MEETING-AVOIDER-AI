from fastapi import FastAPI
from app.routes import meeting
from app.routes import auth
from app.database import engine, Base

app = FastAPI(title="Meeting Avoider AI")

# ensure DB tables exist
Base.metadata.create_all(bind=engine)

app.include_router(meeting.router)
app.include_router(auth.router)

@app.get("/")
def home():
    return {"message": "Backend running"}
