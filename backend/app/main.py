from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import meeting
from app.routes import auth
from app.database import engine, Base

app = FastAPI(title="Meeting Avoider AI")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ensure DB tables exist
Base.metadata.create_all(bind=engine)

app.include_router(meeting.router)
app.include_router(auth.router)


@app.get("/")
def home():
    return {"message": "Backend running"}
