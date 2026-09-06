from pathlib import Path
import asyncio

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.routes import meeting
from app.routes import auth
from app.routes import summarization
from app.routes import user as user_routes
from app.database import engine, Base, apply_sqlite_migrations
from app.models import user, meeting as meeting_model  # noqa: F401
from app.models import transcript as transcript_model, summary as summary_model  # noqa: F401
from app.services.reminder_scheduler import reminder_loop
BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Meeting Avoider AI")

# CORS configuration
# NOTE: allow_origins is permissive ("*") to support the Chrome extension,
# whose chrome-extension://<id> origin is randomly generated per install and
# can't be hardcoded. This is safe here because the app never uses cookies/
# credentials (auth is a plain JSON body + localStorage), so
# allow_credentials stays False. Tighten allow_origins before any real
# production deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ensure DB tables exist, then apply any column migrations needed
# on top of them (in that order — migrations need the tables to exist first)
Base.metadata.create_all(bind=engine)
apply_sqlite_migrations()

app.include_router(meeting.router)
app.include_router(auth.router)
app.include_router(summarization.router)
app.include_router(user_routes.router)

_reminder_task = None

@app.on_event("startup")
async def start_reminder_scheduler():
    global _reminder_task
    # Fire-and-forget background task; runs for the lifetime of the process.
    # See app/services/reminder_scheduler.py for how duplicate reminders and
    # missing SMTP config are handled safely.
    _reminder_task = asyncio.create_task(reminder_loop())


@app.on_event("shutdown")
async def stop_reminder_scheduler():
    if _reminder_task:
        _reminder_task.cancel()
        try:
            await _reminder_task
        except asyncio.CancelledError:
            pass

app.mount(
    "/assets",
    StaticFiles(directory="../frontend/assets"),
    name="assets"
)

@app.get("/", include_in_schema=False)
def home():
    return RedirectResponse(url="/landing.html")

@app.get("/{page_name}.html", response_class=FileResponse, include_in_schema=False)
def render_page(page_name: str):
    page_path = FRONTEND_DIR / "pages" / f"{page_name}.html"
    if page_path.exists():
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/{page_name}", include_in_schema=False)
def redirect_page(page_name: str):
    page_path = FRONTEND_DIR / "pages" / f"{page_name}.html"
    if page_path.exists():
        return RedirectResponse(url=f"/{page_name}.html")
    raise HTTPException(status_code=404, detail="Page not found")

      
