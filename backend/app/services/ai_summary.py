import os
import json
from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError
from typing import List
try:
    from groq import Groq
except ImportError:
    Groq = None

# Load environment variables
load_dotenv()

# Initialize Groq client if dependency and key are available
_api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=_api_key) if Groq and _api_key else None


class AISummaryPayload(BaseModel):
    """The exact structured payload persisted by the summarization route."""

    executive_summary: str
    outcome: str
    overall_summary: str
    key_points: List[str]
    action_items: List[str]
    decisions: List[str]
    deadlines: List[str]
    risks: List[str]
    next_steps: List[str]
    keywords: List[str]
    category: str

    class Config:
        extra = "forbid"


def _summary_json_schema() -> dict:
    """Return a Groq-compatible strict JSON schema across Pydantic versions."""
    if hasattr(AISummaryPayload, "model_json_schema"):
        schema = AISummaryPayload.model_json_schema()
    else:
        schema = AISummaryPayload.schema()
    schema["additionalProperties"] = False
    return schema


def generate_summary(text: str) -> str:
    """
    Generate AI summary for meeting transcript using Groq
    """

    if not text or len(text.strip()) == 0:
        return "No content to summarize."

    if Groq is None:
        return "AI summary unavailable: install the 'groq' package."

    if not _api_key:
        return "AI summary unavailable: GROQ_API_KEY is not set."

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional meeting assistant who creates clear and structured summaries."
                },
                {
                    "role": "user",
                    "content": f"""
Summarize the meeting transcript below in a structured format:

### Summary
- Provide 3–5 short bullet points

### Key Decisions
- List important decisions made
- If none, write "None"

### Action Items
- List tasks or next steps
- Mention responsible person if available
- If none, write "None"

Rules:
- Keep each point concise (1 line)
- Do not repeat information
- Use bullet points only
- No extra explanations

Meeting Transcript:
{text}
"""
                }
            ],
            temperature=0.4,
            max_tokens=250
        )

        summary = response.choices[0].message.content.strip()
        return summary

    except Exception as e:
        return f"Error generating summary: {str(e)}"


def transcribe_audio(file_bytes: bytes, filename: str) -> str:
    """
    Transcribe an uploaded audio file to text using Groq's hosted
    Whisper endpoint (reuses the same GROQ_API_KEY already configured
    for text summarization, so no extra API key is needed).
    """
    if Groq is None:
        raise RuntimeError("Install the 'groq' package to enable audio transcription.")

    if not _api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")

    try:
        transcription = client.audio.transcriptions.create(
            file=(filename, file_bytes),
            model="whisper-large-v3",
            response_format="text",
        )
        # response_format="text" returns a plain string on newer SDK versions,
        # but fall back to .text if the SDK returns an object instead.
        return transcription if isinstance(transcription, str) else transcription.text
    except Exception as e:
        raise RuntimeError(f"Audio transcription failed: {str(e)}")


def generate_structured_summary(text: str) -> dict:
    """
    Generate a structured meeting summary (overall summary, key points,
    action items, decisions) as a dict, for the dedicated Meeting
    Summarization module. Returns plain-string values for each list item
    (already split), never markdown.
    """
    empty = {
        "executive_summary": "", "outcome": "", "overall_summary": "", "key_points": [],
        "action_items": [], "decisions": [], "deadlines": [], "risks": [],
        "next_steps": [], "keywords": [], "category": "",
    }

    if not text or not text.strip():
        return empty

    if Groq is None:
        raise RuntimeError("Install the 'groq' package to enable AI summarization.")
    if not _api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")

    prompt = f"""
Analyze the meeting transcript below and return ONLY JSON matching the supplied
meeting-summary schema. Do not return markdown, code fences, commentary, or a
second object. Use empty arrays when a list section has nothing to report and an
empty string only when a text section has nothing to report. Keep each list item
to one concise line. The category must be one of: Project, Client, HR, Academic,
Standup, Planning, Other.

Meeting Transcript:
{text}
"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional meeting assistant. You reply with strict JSON only."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            reasoning_effort="medium",
            max_completion_tokens=1600,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "meeting_summary",
                    "strict": True,
                    "schema": _summary_json_schema(),
                },
            },
        )

        choice = response.choices[0]
        finish_reason = getattr(choice, "finish_reason", None)
        raw = getattr(choice.message, "content", None)
        if not raw:
            raise RuntimeError("Groq returned no summary content (the response may have been refused).")
        if finish_reason == "length":
            raise RuntimeError("Groq truncated the structured summary before it was complete; try again.")

        try:
            payload = AISummaryPayload(**json.loads(raw))
        except (json.JSONDecodeError, TypeError, ValidationError) as e:
            raise RuntimeError(f"Groq returned invalid structured summary JSON: {e}") from e

        result = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        result["category"] = result["category"].strip() or "Other"
        return result

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Groq structured summary request failed: {e}") from e


def answer_meeting_question(transcript_text: str, summary_context: str, question: str) -> str:
    """
    Per-meeting AI chat: answers a question grounded ONLY in this meeting's
    transcript + summary. No vector search/embeddings — the transcript is
    capped upstream (MAX_TEXT_LENGTH) so it comfortably fits directly in the
    prompt. This is intentionally simple; a true multi-meeting knowledge
    search would need an embeddings/vector-store pipeline, which is out of
    scope for this pass.
    """
    if not question or not question.strip():
        return "Please ask a question."

    if Groq is None:
        raise RuntimeError("Install the 'groq' package to enable the meeting chat.")
    if not _api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")

    system_prompt = (
        "You are an assistant that answers questions about ONE specific meeting. "
        "Only use the transcript and summary provided below. "
        "If the answer isn't in them, say you don't know based on this meeting's "
        "transcript — do not guess or use outside knowledge. Keep answers short and direct."
    )

    context = f"""
MEETING SUMMARY:
{summary_context}

FULL TRANSCRIPT:
{transcript_text}
"""

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{context}\n\nQuestion: {question.strip()}"},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        raise RuntimeError(f"Error answering question: {str(e)}")
