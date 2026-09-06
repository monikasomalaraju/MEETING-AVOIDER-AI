from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional

from datetime import datetime

from app.database import get_db
from app.models.user import User
from app.models.meeting import MeetingDB
from app.models.transcript import TranscriptDB
from app.models.summary import SummaryDB
from app.schemas.summarization import TranscriptOut, TranscriptListItem, SummaryOut, ChatResponse
from app.services.ai_summary import transcribe_audio, generate_structured_summary, answer_meeting_question

router = APIRouter(prefix="/summarization", tags=["summarization"])

MAX_TEXT_LENGTH = 8000  # generous cap so a Groq call never blows the context window
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm"}
MAX_AUDIO_SIZE_MB = 25


def _split(value: Optional[str]) -> List[str]:
    return value.split("\n") if value else []


def _to_summary_out(summary: SummaryDB) -> dict:
    return {
        "id": summary.id,
        "executive_summary": summary.executive_summary or "",
        "outcome": summary.outcome or "",
        "overall_summary": summary.overall_summary or "",
        "key_points": _split(summary.key_points),
        "action_items": _split(summary.action_items),
        "decisions": _split(summary.decisions),
        "deadlines": _split(summary.deadlines),
        "risks": _split(summary.risks),
        "next_steps": _split(summary.next_steps),
        "keywords": _split(summary.keywords),
        "category": summary.category or "Other",
        "created_at": summary.created_at,
    }


def _to_transcript_out(t: TranscriptDB) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "meeting_id": t.meeting_id,
        "title": t.title,
        "meeting_date": t.meeting_date,
        "participants": t.participants,
        "duration": t.duration,
        "source_type": t.source_type,
        "original_filename": t.original_filename,
        "raw_text": t.raw_text,
        "created_at": t.created_at,
        "summary": _to_summary_out(t.summary) if t.summary else None,
    }


@router.post("/transcripts", response_model=TranscriptOut)
async def create_transcript(
    user_id: int = Form(...),
    title: str = Form(...),
    meeting_date: Optional[str] = Form(None),
    participants: Optional[str] = Form(None),
    duration: Optional[str] = Form(None),
    meeting_id: Optional[int] = Form(None),
    text: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    Create a transcript either from pasted/uploaded text OR an uploaded audio
    file (which is transcribed via Whisper first). Exactly one of `text` /
    `audio` should be provided.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not title.strip():
        raise HTTPException(status_code=400, detail="Meeting title is required")

    if meeting_id is not None:
        owned_meeting = db.query(MeetingDB).filter(
            MeetingDB.id == meeting_id, MeetingDB.user_id == user_id
        ).first()
        if not owned_meeting:
            raise HTTPException(status_code=404, detail="Meeting not found for this user")

    source_type = "text"
    original_filename = None
    raw_text = ""

    if audio is not None:
        ext = "." + audio.filename.rsplit(".", 1)[-1].lower() if "." in audio.filename else ""
        if ext not in ALLOWED_AUDIO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
            )

        audio_bytes = await audio.read()
        if len(audio_bytes) > MAX_AUDIO_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Audio file exceeds {MAX_AUDIO_SIZE_MB}MB limit")
        if len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty")

        try:
            raw_text = transcribe_audio(audio_bytes, audio.filename)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        source_type = "audio"
        original_filename = audio.filename

    elif text and text.strip():
        raw_text = text.strip()[:MAX_TEXT_LENGTH]
        source_type = "text"

    else:
        raise HTTPException(status_code=400, detail="Provide either transcript text or an audio file")

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty after processing")

    # Auto-create a linked Meeting entry unless the caller already attached
    # this transcript to an existing meeting. This is what makes the
    # "extension -> transcript -> meeting created automatically" workflow work,
    # and also means ad-hoc/audio transcripts show up in Upcoming/Past Meetings.
    #
    # BUG FIX: previously this always created a brand-new MeetingDB row, so
    # re-summarizing the same meeting from scratch (not via ?transcript_id=)
    # silently spawned duplicate meetings with the same title. We now first
    # check for an existing meeting for this user with the same title AND
    # the same date (a compound match — title alone is not a safe signal on
    # its own, since two unrelated meetings could share a title) before
    # creating a new one.
    if meeting_id is None:
        existing_meeting = None
        if meeting_date:
            existing_meeting = (
                db.query(MeetingDB)
                .filter(
                    MeetingDB.user_id == user_id,
                    MeetingDB.title == title.strip(),
                    MeetingDB.date == meeting_date,
                )
                .order_by(MeetingDB.created_at.desc())
                .first()
            )

        if existing_meeting:
            meeting_id = existing_meeting.id
            # Keep the meeting's stored transcript text in sync with the
            # latest one, without touching its schedule/link/participants.
            existing_meeting.text = raw_text
        else:
            auto_meeting = MeetingDB(
                user_id=user_id,
                title=title.strip(),
                date=meeting_date or datetime.now().strftime("%Y-%m-%d"),
                time=datetime.now().strftime("%H:%M"),
                link=None,
                participants=participants,
                text=raw_text,
            )
            db.add(auto_meeting)
            db.commit()
            db.refresh(auto_meeting)
            meeting_id = auto_meeting.id

    transcript = TranscriptDB(
        user_id=user_id,
        meeting_id=meeting_id,
        title=title.strip(),
        meeting_date=meeting_date,
        participants=participants,
        duration=duration,
        source_type=source_type,
        original_filename=original_filename,
        raw_text=raw_text,
    )

    db.add(transcript)
    db.commit()
    db.refresh(transcript)

    return _to_transcript_out(transcript)


@router.post("/summarize/{transcript_id}", response_model=TranscriptOut)
def summarize_transcript(transcript_id: int, db: Session = Depends(get_db)):
    transcript = db.query(TranscriptDB).filter(TranscriptDB.id == transcript_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    if transcript.summary:
        return _to_transcript_out(transcript)

    try:
        result = generate_structured_summary(transcript.raw_text)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    summary = SummaryDB(
        transcript_id=transcript.id,
        executive_summary=result["executive_summary"],
        outcome=result["outcome"],
        overall_summary=result["overall_summary"],
        key_points="\n".join(result["key_points"]),
        action_items="\n".join(result["action_items"]),
        decisions="\n".join(result["decisions"]),
        deadlines="\n".join(result["deadlines"]),
        risks="\n".join(result["risks"]),
        next_steps="\n".join(result["next_steps"]),
        keywords="\n".join(result["keywords"]),
        category=result["category"],
    )

    db.add(summary)
    db.commit()
    db.refresh(transcript)

    # Keep the linked Meeting entry's summary field in sync so it shows up
    # in the regular meeting views/history too, not just the summarization page.
    if transcript.meeting_id:
        linked_meeting = db.query(MeetingDB).filter(MeetingDB.id == transcript.meeting_id).first()
        if linked_meeting:
            linked_meeting.summary = result["overall_summary"]
            db.commit()

    return _to_transcript_out(transcript)


@router.get("/history/{user_id}", response_model=List[TranscriptListItem])
def get_history(user_id: int, db: Session = Depends(get_db)):
    transcripts = (
        db.query(TranscriptDB)
        .filter(TranscriptDB.user_id == user_id)
        .order_by(TranscriptDB.created_at.desc())
        .all()
    )

    def _preview(text, limit=140):
        if not text:
            return None
        text = text.strip()
        return (text[:limit] + "…") if len(text) > limit else text

    result = []
    for t in transcripts:
        summary = t.summary
        preview_source = None
        category = None
        action_count = decision_count = deadline_count = 0

        if summary:
            preview_source = summary.overall_summary or summary.executive_summary
            category = summary.category
            action_count = len(_split(summary.action_items))
            decision_count = len(_split(summary.decisions))
            deadline_count = len(_split(summary.deadlines))

        result.append({
            "id": t.id,
            "title": t.title,
            "meeting_date": t.meeting_date,
            "duration": t.duration,
            "participants": t.participants,
            "source_type": t.source_type,
            "created_at": t.created_at,
            "has_summary": summary is not None,
            "category": category,
            "preview": _preview(preview_source),
            "action_items_count": action_count,
            "decisions_count": decision_count,
            "deadlines_count": deadline_count,
        })
    return result


@router.get("/transcripts/{transcript_id}", response_model=TranscriptOut)
def get_transcript(transcript_id: int, user_id: int, db: Session = Depends(get_db)):
    transcript = db.query(TranscriptDB).filter(TranscriptDB.id == transcript_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if transcript.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return _to_transcript_out(transcript)


@router.post("/chat/{transcript_id}", response_model=ChatResponse)
def chat_about_meeting(
    transcript_id: int,
    user_id: int = Form(...),
    question: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Per-meeting AI chat. Grounded only in this meeting's transcript + summary
    (no cross-meeting search — see services/ai_summary.py for why).
    """
    transcript = db.query(TranscriptDB).filter(TranscriptDB.id == transcript_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if transcript.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if transcript.summary:
        s = transcript.summary
        summary_context = "\n".join(filter(None, [
            f"Executive Summary: {s.executive_summary}" if s.executive_summary else "",
            f"Outcome: {s.outcome}" if s.outcome else "",
            f"Detailed Summary: {s.overall_summary}" if s.overall_summary else "",
            f"Key Points: {s.key_points}" if s.key_points else "",
            f"Decisions: {s.decisions}" if s.decisions else "",
            f"Action Items: {s.action_items}" if s.action_items else "",
            f"Deadlines: {s.deadlines}" if s.deadlines else "",
            f"Risks/Blockers: {s.risks}" if s.risks else "",
        ]))
    else:
        summary_context = "(No AI summary generated yet for this meeting.)"

    try:
        answer = answer_meeting_question(transcript.raw_text, summary_context, question)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"answer": answer}


@router.delete("/transcripts/{transcript_id}")
def delete_transcript(transcript_id: int, user_id: int, db: Session = Depends(get_db)):
    transcript = db.query(TranscriptDB).filter(TranscriptDB.id == transcript_id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if transcript.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(transcript)
    db.commit()
    return {"message": "Transcript deleted"}
