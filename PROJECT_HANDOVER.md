# Meeting Avoider AI — Project Handover & Codebase Walkthrough

This document is written as if I (the engineer who built this with you) am handing the project to you as its new primary maintainer. No code is changed here — this is pure documentation.

---

## 1. Project Overview

### Objective
Meeting Avoider AI reduces the time people waste in and reviewing meetings. It lets a user schedule meetings, and — the core feature — turn a transcript (typed, uploaded as a `.txt`, uploaded as an audio file, or captured via a Chrome extension) into a structured AI summary: executive summary, detailed summary, key points, decisions, action items, deadlines, risks/blockers, next steps, keywords, and a category. Each summarized meeting also gets its own AI chat assistant.

### Problem Statement
Meetings are long, repetitive, and poorly documented. Reviewing a full recording/transcript to extract "what actually happened" is slow. This project automates that extraction.

### Overall Workflow
```
Schedule/attend a meeting
      ↓
Get a transcript (paste it, upload a .txt, upload audio, or capture via
the Chrome extension while in the meeting)
      ↓
Transcript stored + a Meeting entry auto-created
      ↓
Click "Summarize" → Groq LLM call → structured summary stored
      ↓
View results as cards; ask the per-meeting AI chat questions
      ↓
Everything also appears in Upcoming/Past Meetings + meeting history
```

### Main Features
- Signup/login (email + password)
- Dashboard, Calendar view
- Create / Edit / Delete meetings (title, date, time, link, participants)
- Upcoming / Present (today) / Past meeting lists
- Meeting Summarization page (paste text, upload `.txt`, or upload audio)
- Chrome extension for capturing/sending transcripts from the browser

### AI Features
- **Audio transcription** — Groq-hosted Whisper (`whisper-large-v3`)
- **Structured summarization** — Groq LLM (`openai/gpt-oss-20b`) in JSON mode, producing: executive summary, detailed summary, key points, decisions, action items, deadlines, risks/blockers, next steps, keywords, category
- **Per-meeting AI chat** — Q&A grounded only in that meeting's transcript + summary (the whole transcript is fed into the prompt each time — no vector database/embeddings involved; see §7 for why)

### Chrome Extension Workflow
```
User in a meeting → clicks extension icon → logs in (first time only)
      ↓
Clicks "Capture from this page" (best-effort) or pastes transcript manually
      ↓
Clicks "Send" → POST /summarization/transcripts (multipart form)
      ↓
Backend auto-creates a Meeting row + a Transcript row, linked together
      ↓
Extension opens a new tab: meeting-summarization.html?transcript_id=<id>
      ↓
That page loads the transcript automatically (title/date/participants/text
all pre-filled) — the user only has to click "Summarize"
```

### Technologies Used & Why

| Layer | Technology | Why it was chosen |
|---|---|---|
| Backend framework | FastAPI | Async-friendly, automatic request validation via Pydantic, minimal boilerplate — fast to build a small API surface with |
| ORM | SQLAlchemy | Standard, works with SQLite with zero config, easy to swap to Postgres/MySQL later by changing one connection string |
| Database | SQLite | Zero-setup, file-based — appropriate for a student/portfolio project; not meant for concurrent production load |
| Password hashing | Passlib (`pbkdf2_sha256`) | Well-tested hashing library; `pbkdf2_sha256` avoids the extra native-compile dependency `bcrypt` needs on Windows |
| AI provider | Groq API | Free tier, very fast inference (LPU hardware), OpenAI-compatible SDK shape, and it offers **both** chat completion (for summaries) and Whisper transcription (for audio) under one API key — one provider covers both AI needs |
| Frontend | Plain HTML/CSS/JS | No build tooling needed, runs by opening the FastAPI server — appropriate given there's no team/CI pipeline requiring a framework |
| PDF export | jsPDF (CDN) | Client-side PDF generation with zero backend involvement |
| Extension | Chrome Manifest V3 | Current required standard for new Chrome extensions |

---

## 2. Architecture

```
 Browser (or Chrome Extension popup)
        │  fetch() calls, multipart/form-data or JSON
        ▼
 FastAPI app (backend/app/main.py)
        │
        ├── Static file serving: /assets/* (CSS/JS/images)
        ├── Page serving: /<page>.html → frontend/pages/<page>.html
        │
        ▼
 Routers (backend/app/routes/*.py)
        │  each router depends on get_db() for a SQLAlchemy session
        ▼
 SQLAlchemy Models (backend/app/models/*.py)
        │
        ▼
 SQLite database (backend/meeting.db)

 Separately, routes/summarization.py also calls:
        ▼
 services/ai_summary.py → Groq API (chat completions + Whisper transcription)
```

Data flow for the AI feature specifically:
```
Transcript text
      ↓
services/ai_summary.generate_structured_summary()
      ↓
Groq chat.completions.create(..., response_format=json_object)
      ↓
JSON parsed → dict of 10 fields
      ↓
Stored as a SummaryDB row (list fields joined with "\n")
      ↓
Read back and split("\n") into lists again when returned to the frontend
```

---

## 3. Folder Structure

```
MEETING-AVOIDER-AI-main/
│
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app instance, CORS, static/page serving, router registration, DB init
│   │   ├── database.py        # engine, SessionLocal, Base, get_db(), SQLite column migrations
│   │   ├── models/            # SQLAlchemy table definitions (one class = one table)
│   │   │   ├── user.py           # User table
│   │   │   ├── meeting.py        # MeetingDB table (scheduled meetings)
│   │   │   ├── transcript.py     # TranscriptDB table (raw transcript + metadata)
│   │   │   └── summary.py        # SummaryDB table (AI output, 1:1 with a transcript)
│   │   ├── schemas/           # Pydantic request/response models (validation + API docs)
│   │   │   ├── user.py, meeting.py, summarization.py
│   │   ├── routes/            # API endpoints, grouped by feature
│   │   │   ├── auth.py           # /auth/signup, /auth/login
│   │   │   ├── meeting.py        # /meetings/* CRUD
│   │   │   ├── summarization.py  # /summarization/* (transcripts, summarize, chat, history)
│   │   │   └── test.py           # NOT registered in main.py — dead debug code, see §14
│   │   └── services/
│   │       └── ai_summary.py     # All Groq API calls live here (transcription, summarization, chat)
│   ├── requirements.txt
│   ├── .env / .env.example    # GROQ_API_KEY
│   └── meeting.db             # created automatically on first run
│
├── frontend/
│   ├── pages/                 # one .html file per page, all served by FastAPI directly
│   ├── assets/
│   │   ├── css/                  # one stylesheet per page (mostly), + dashboard.css holds shared theme variables
│   │   ├── js/                   # one script per page, talks to the backend via fetch()
│   │   └── images/
│
├── meeting-avoider-extension/  # Chrome Manifest V3 extension (separate from the web app)
│   ├── manifest.json
│   ├── popup.html / popup.css / popup.js   # the UI you see when clicking the extension icon
│   ├── content.js               # runs inside meeting-platform tabs, does best-effort caption capture
│   ├── background.js            # minimal service worker (first-install redirect only)
│   └── icons/
│
├── README.md                   # setup instructions
└── PROJECT_HANDOVER.md          # this file
```

**Why `models/`, `schemas/`, `routes/`, `services/` are separate:** this is the standard FastAPI layering —
- **models** = what's actually in the database
- **schemas** = what's allowed in/out of the API (a model can have fields a schema deliberately hides, e.g. `hashed_password` is never in `UserOut`)
- **routes** = the HTTP layer — parses the request, calls the DB and/or a service, returns a schema
- **services** = business logic that isn't simple CRUD (here: all AI calls)

---

## 4. Database

SQLite file: `backend/meeting.db`. Four tables:

### `users`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| name | String | |
| email | String | unique |
| hashed_password | String | pbkdf2_sha256 hash, never returned by the API |
| created_at | DateTime | |

### `meetings`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | Integer FK → users.id | |
| title, date, time | String | required |
| link | String | nullable (meeting URL) |
| participants | String | nullable, comma-separated names |
| text | Text | nullable (raw meeting text, used for the simpler inline "AI Summary" feature that predates the Meeting Summarization module) |
| summary | Text | nullable — kept in sync with the linked transcript's `overall_summary` when one exists |
| created_at | DateTime | |

### `transcripts`
| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| user_id | Integer FK → users.id | |
| meeting_id | Integer FK → meetings.id | nullable, but in practice always set (auto-created — see §5) |
| title, meeting_date, participants | String | |
| source_type | String | `"text"` or `"audio"` |
| original_filename | String | nullable, set only for audio uploads |
| raw_text | Text | the transcript itself (capped at 8000 chars — `MAX_TEXT_LENGTH` in routes/summarization.py) |
| created_at | DateTime | |

### `summaries`
1:1 with `transcripts` (unique FK).

| Column | Type | Notes |
|---|---|---|
| id | Integer PK | |
| transcript_id | Integer FK → transcripts.id, unique | |
| executive_summary | Text | 1-2 sentence outcome |
| overall_summary | Text | detailed summary |
| key_points, action_items, decisions, deadlines, risks, next_steps, keywords | Text | **all stored as `\n`-joined strings**, split back into lists by the API layer (`_split()` in routes/summarization.py) — a deliberate simplification instead of separate join tables |
| category | Text | e.g. "Project", "Client", "HR" |
| created_at | DateTime | |

**Relationships:**
```
User (1) ──< (many) MeetingDB
User (1) ──< (many) TranscriptDB
MeetingDB (1) ──< (many) TranscriptDB     [via transcript.meeting_id]
TranscriptDB (1) ── (1) SummaryDB          [unique FK, cascade delete]
```
No explicit indexes beyond the primary keys and the `id` index SQLAlchemy adds by default — fine at this scale, would matter at real production volume.

**How migrations work:** there's no Alembic. `database.py`'s `apply_sqlite_migrations()` runs simple `ALTER TABLE ... ADD COLUMN` statements guarded by a `PRAGMA table_info()` check, so it's safe to run repeatedly and safe against a genuinely empty database (it checks the table exists first). It's called explicitly from `main.py`, **after** `Base.metadata.create_all()` — this ordering matters (see §14 for the bug this caused once).

---

## 5. Backend Walkthrough (every endpoint)

### `auth.py` — prefix `/auth`
| Endpoint | Method | Body | Response | Notes |
|---|---|---|---|---|
| `/auth/signup` | POST | `{name, email, password}` | `UserOut` (no password) | 400 if email already registered |
| `/auth/login` | POST | `{email, password}` | `{message, user: {id, name, email}}` | 401 on bad credentials. **No JWT/session token is issued** — see §9 |

### `meeting.py` — prefix `/meetings`
Standard CRUD over `MeetingDB`, scoped by `user_id`:
- `POST /meetings` — create (validates via `MeetingCreate` schema; `link` required, `participants` optional)
- `GET /meetings/{user_id}` — list all meetings for a user
- `PUT /meetings/{id}` — update (title/date/time/link/participants)
- `DELETE /meetings/{id}` — requires `user_id` query param, checks ownership before deleting

### `summarization.py` — prefix `/summarization` (the core feature)
| Endpoint | Method | Purpose |
|---|---|---|
| `POST /summarization/transcripts` | POST | Accepts `user_id, title, meeting_date?, participants?, meeting_id?` + either `text` or an `audio` file (multipart). If audio, transcribes it first via Whisper. **If `meeting_id` isn't given, auto-creates a `MeetingDB` row and links it** — this is what makes transcripts show up in the regular meeting views. |
| `POST /summarization/summarize/{transcript_id}` | POST | Calls `generate_structured_summary()`, stores a `SummaryDB` row, syncs `meeting.summary`. If a summary already exists, returns it as-is (idempotent — won't regenerate/waste an API call). |
| `POST /summarization/chat/{transcript_id}` | POST | `user_id, question` → builds a context string from the stored summary, calls `answer_meeting_question()`, returns `{answer}` |
| `GET /summarization/history/{user_id}` | GET | Lightweight list (no full transcript text) for a history page |
| `GET /summarization/transcripts/{id}?user_id=` | GET | Full transcript + summary, ownership-checked |
| `DELETE /summarization/transcripts/{id}?user_id=` | DELETE | Ownership-checked delete |

**Validation specifics:** audio must be one of `.mp3 .wav .m4a .ogg .webm`, capped at 25MB; text is truncated to 8000 characters; title is required and non-empty (server-side, in addition to frontend validation).

**Error handling pattern used throughout:** service-layer functions raise `RuntimeError` on AI/API failure; routes catch that and convert it to `HTTPException(502, ...)`. Not-found → 404. Ownership mismatch → 403.

### Complete request lifecycle example (Summarize button click)
```
User clicks "Summarize" (meeting-summarization.js: msSummarize())
      ↓
fetch POST /summarization/transcripts  (if no transcript_id yet)
      ↓
FastAPI route create_transcript() — validates user, validates file/text,
  optionally calls transcribe_audio(), auto-creates MeetingDB row,
  inserts TranscriptDB row, commits
      ↓
Response: TranscriptOut JSON → frontend stores transcript.id
      ↓
fetch POST /summarization/summarize/{id}
      ↓
FastAPI route summarize_transcript() — calls generate_structured_summary()
  → Groq API call (json_object mode) → parsed dict
      ↓
Inserts SummaryDB row, syncs meeting.summary, commits
      ↓
Response: TranscriptOut (with nested SummaryOut) JSON
      ↓
Frontend: msRenderResult() populates all the result cards
```

---

## 6. Frontend Walkthrough

All pages share the same pattern: plain HTML + a page-specific `.js` file that reads `localStorage.currentUser` (set at login) and calls the backend with `fetch()`. There's no framework, no client-side router, no bundler — navigation is just `<a href="other-page.html">` or `window.location.href = "..."`.

| Page | JS file | Purpose | Key API calls |
|---|---|---|---|
| `landing.html` | — (static) | Public entry point; `/` redirects here | none |
| `login.html` / `signup.html` | `script.js` | Auth forms | `POST /auth/login`, `POST /auth/signup` |
| `dashboard.html` | `dashboard-modern.js` | Real KPIs, today's meetings, AI insights, activity timeline | `GET /users/{user_id}/dashboard` (one consolidated call) |
| `add-meeting.html` | `add-meeting.js` | Create a meeting | `POST /meetings` |
| `edit-meeting.html` | `edit-meeting.js` | Edit a meeting (reads `?id=` from URL) | `GET`/`PUT /meetings/{id}` |
| `calendar.html` | `calendar.js` | Calendar grid view | `GET /meetings/{user_id}` |
| `future-meetings.html`, `present-meetings.html`, `past-meetings.html` | `meetings.js` (shared) | Filtered meeting lists (tab bar between them) with Join/Edit/Delete | `GET /meetings/{user_id}`, `DELETE /meetings/{id}` |
| `meeting-summarization.html` | `meeting-summarization.js` | Core AI feature: create transcript, summarize, view results, chat | `POST /summarization/transcripts`, `/summarize/{id}`, `/chat/{id}`, `GET /summarization/transcripts/{id}` |
| `summary.html` (sidebar label: **Meeting History**) | `summary.js` | List of meetings with their stored AI summaries | `GET /meetings/{user_id}` |
| `profile.html` | `profile.js` | Personal info, security, real usage stats, danger zone | `GET/PUT /users/{id}/profile`, `GET /users/{id}/stats`, `POST /users/{id}/change-password`, `DELETE /users/{id}` |
| `help.html` | — (static) | End-user help content | none |

**How `meetings.js` is shared across three pages:** each page's `<body>` tag has `data-meeting-type="future"` (or `present`/`past`), and `meetings.js` reads `document.body.dataset.meetingType` to decide which filter to apply to the same fetched list. One script, three pages.

**How the Meeting Summarization page supports the extension handoff:** on `DOMContentLoaded`, it checks `?transcript_id=` in the URL. If present, it fetches that transcript and pre-fills the form instead of starting blank — this is how "extension sends transcript → page opens already filled in" works (§8).

---

## 7. AI Workflow (Full Pipeline)

```
Transcript source: pasted text | uploaded .txt | uploaded audio | extension capture
      ↓
[audio only] transcribe_audio() → Groq Whisper (whisper-large-v3) → plain text
      ↓
Text capped at 8000 chars (MAX_TEXT_LENGTH) — a practical guard against
blowing past the LLM's context window on very long transcripts, not a
"preprocessing" step in the NLP sense (no stopword removal, lemmatization,
etc. — see the difference from the original research paper's design, §14)
      ↓
generate_structured_summary(text) → single Groq chat.completions.create()
  call, response_format={"type": "json_object"}, asking for all 10 fields
  in one JSON object (executive_summary, overall_summary, key_points,
  action_items, decisions, deadlines, risks, next_steps, keywords, category)
      ↓
JSON parsed (with a regex fallback if the model wraps it in stray text)
      ↓
Stored as one SummaryDB row
      ↓
Displayed as cards; also feeds the per-meeting chat's context
```

**Which model and why:** `openai/gpt-oss-20b` via Groq — chosen for speed (Groq's LPU inference is very fast, which matters for a synchronous "click Summarize, wait a few seconds" UX) and cost (free tier). It is **not** fine-tuned or specialized for meetings — all the structure comes from prompt engineering (asking for a specific JSON shape), not model training.

**Per-meeting chat, and why it's not a "real" RAG/search system:** `answer_meeting_question()` just stuffs the whole transcript + summary into the prompt as context and asks the LLM to answer only from that. This works well **for a single meeting** because the transcript is capped at 8000 characters — small enough to fit comfortably in one prompt. It deliberately does **not** support searching across *all* of a user's meetings — that would require embedding every transcript into a vector store (e.g. via `sentence-transformers` + FAISS/Chroma/pgvector) and doing similarity search before generating an answer. That's a legitimate follow-on project, not something bolted onto this one — flagging this clearly so it doesn't get assumed as "already working" in a viva.

**Where "Text Preprocessing" from the original research paper stands today:** the paper describes stopword removal, lemmatization, tokenization, and speaker diarization as explicit preprocessing steps. None of those run in this codebase — the transcript goes to the LLM close to as-is (just length-capped). The LLM implicitly handles noise tolerance, but if asked in a viva "where does preprocessing happen," the honest answer is: it doesn't, as a separate step — that's a known gap vs. the original paper (see §14).

---

## 8. Chrome Extension — Complete Lifecycle

### Folder structure
```
meeting-avoider-extension/
├── manifest.json      # Manifest V3 config
├── popup.html/.css/.js  # the extension's UI (click the toolbar icon)
├── content.js          # injected into meet.google.com / *.zoom.us / teams.microsoft.com
├── background.js       # service worker, minimal
└── icons/               # 16/48/128px PNGs
```

### `manifest.json`
- `manifest_version: 3` (current required standard)
- `action.default_popup` → `popup.html`
- `content_scripts` → runs `content.js` on the three supported meeting platforms, `run_at: document_idle`
- `permissions: ["storage", "activeTab", "scripting"]` — `storage` for saving the logged-in user, `activeTab`/`scripting` to message the content script on the current tab
- `host_permissions` → `127.0.0.1:8000` and `localhost:8000` (the backend)

### Popup lifecycle (`popup.js`)
1. On open: checks `chrome.storage.local` for a saved user (`maUser`). If absent, shows a login form.
2. Login → `POST /auth/login` (same endpoint the web app uses) → stores `{id, name, email}` in `chrome.storage.local`.
3. Main view: title input, "Capture from this page" button, transcript textarea, Send button.
4. **Capture:** sends a `chrome.tabs.sendMessage({type: "MA_CAPTURE_TRANSCRIPT"})` to the content script in the active tab.
5. **Send:** builds a `FormData` (`user_id, title, text, meeting_date`, and the source URL folded into `participants` since there's no dedicated URL column), `POST`s to `/summarization/transcripts`, then opens a new tab at `.../meeting-summarization.html?transcript_id=<id>` — **it does not call `/summarize` itself**, by design (the user should consciously click Summarize).

### Content script (`content.js`)
- `captureTranscript()` branches on `window.location.hostname` (Meet/Zoom/Teams) and queries broad, best-effort CSS selectors for visible caption text (e.g. `[aria-label="Captions"] *` for Meet).
- Also infers a meeting title from `document.title`, stripping platform suffixes.
- Listens for the popup's message via `chrome.runtime.onMessage`, responds synchronously with `{text, title, url}`.
- **This is intentionally fragile** — these platforms don't expose an official transcript API, and their DOM/class names change without notice. If nothing is found, the popup tells the user to paste manually, which always works.

### Background script (`background.js`)
Minimal — on first install, opens the login page in a new tab. No persistent background logic (Manifest V3 service workers aren't meant to run continuously anyway).

### How the website "opens automatically"
It's a plain `chrome.tabs.create({url: ...})` call after the transcript POST succeeds — not literally "automatic" from the user's perspective in the sense of no click at all, but no *manual upload step* is needed: the transcript is already saved server-side and the page loads it via the URL parameter.

---

## 9. Authentication

- **Password storage:** `passlib` with `pbkdf2_sha256`. Passwords are hashed before insert, never stored or returned in plaintext.
- **Login:** compares the submitted password against the stored hash with `pwd_context.verify()`.
- **No JWT, no server-side sessions, no cookies.** Login returns a plain JSON object (`{id, name, email}`), which the frontend stores in `localStorage.currentUser` and then sends `user_id` as a plain form/query field on every subsequent request.
- **Authorization = ownership checks, not real auth.** Every protected route compares `record.user_id == user_id` from the request. **Anyone who knows or guesses another user's `user_id` can pass it in and access their data** — there is no verification that the caller is actually who they claim to be. This is the single biggest security gap in the project (expected/acceptable for a student project scope, but should be named clearly as a known limitation, not glossed over).
- **CORS is wide open** (`allow_origins=["*"]`) to support the Chrome extension's random per-install origin. Safe *only* because there are no cookies/credentials involved — but combined with the lack of real auth, this is not production-hardened.

**If you extend this project, the highest-value security fix is:** replace the `user_id`-in-body pattern with real JWT (or session) authentication, issued at login and validated on every protected route via a FastAPI dependency.

---

## 10. Complete User Flow

```
Signup → Login (localStorage.currentUser set)
   ↓
Dashboard (today's/upcoming meetings, quick actions)
   ↓
Schedule a meeting (add-meeting.html) — OR —
Go straight to Meeting Summarization
   ↓
[Optional] Use the Chrome extension during/after a live meeting to
capture a transcript, which auto-creates a Meeting + Transcript and
opens the summarization page pre-filled
   ↓
Paste/upload transcript or audio → click Summarize
   ↓
AI generates structured summary → displayed as cards
   ↓
Ask the per-meeting AI chat questions about it
   ↓
Copy summary / Download as PDF
   ↓
Meeting appears in Upcoming/Past Meetings and (once past) meeting history
   ↓
Edit or Delete the meeting as needed
   ↓
Logout (frontend just clears localStorage — no server-side session to end)
```

---

## 11. Third-Party Libraries

| Package | Where used | Why | Essential? | Alternatives |
|---|---|---|---|---|
| `fastapi` | backend | Web framework | Yes | Flask, Django REST |
| `uvicorn[standard]` | backend | ASGI server to actually run FastAPI | Yes | Hypercorn |
| `sqlalchemy` | backend | ORM | Yes | Raw `sqlite3`, Tortoise ORM |
| `pydantic` | backend (via FastAPI) | Request/response validation | Yes | Marshmallow |
| `passlib[bcrypt]` | backend | Password hashing (actually configured to use `pbkdf2_sha256`, see note below) | Yes | `bcrypt` directly, `argon2-cffi` |
| `email-validator` | backend | Validates email format in Pydantic schemas | Yes (for that validation) | Manual regex |
| `groq` | backend | AI provider SDK (chat + Whisper) | Yes | `openai` SDK pointed at another provider, `anthropic` SDK |
| `python-dotenv` | backend | Loads `GROQ_API_KEY` from `.env` | Yes | `os.environ` set manually |
| `python-multipart` | backend | Required by FastAPI for `Form(...)`/`UploadFile` parsing | Yes (silently required, easy to forget) | — |
| `jsPDF` (CDN) | frontend | Client-side PDF generation for summary downloads | No — could generate PDFs server-side instead (e.g. via `reportlab` or `weasyprint`) | Server-side PDF libs |
| Font Awesome (CDN) | frontend | Icons | No | Any icon font/SVG set |

**Note on `passlib[bcrypt]`:** the requirements file lists the `bcrypt` extra, but the code actually configures `CryptContext(schemes=["pbkdf2_sha256"])` — `bcrypt` isn't actually used. Harmless (just an unused extra dependency), but worth knowing if you're trimming dependencies later.

---

## 12. Current Progress

**Estimated completion: ~75-80%** for a polished student/portfolio project; **~25-30%** against the *original research paper's* full scope (which described video upload, full ASR + speaker diarization + slide/visual analysis — most of that was never built; the real system works from text/audio transcripts, not video, and has no speaker diarization or visual analysis).

**Completed:**
- Auth (signup/login)
- Meeting CRUD + calendar + filtered lists
- Text/audio → structured AI summary (10 fields)
- Per-meeting AI chat
- PDF/copy export
- Chrome extension with auto-create-meeting + auto-populate flow

**Partially completed:**
- Profile pages exist but are basic (no avatar upload, no password change flow, no meeting statistics — these were discussed as future work)
- Meeting history is really just the filtered meeting lists, not a dedicated searchable/tagged knowledge base

**Missing (known, not started):**
- Cross-meeting AI search ("show meetings where budget was discussed") — needs an embeddings/vector-store pipeline
- Analytics dashboard (productivity score, meeting trends, charts)
- Transcript highlighting (color-coded deadlines/decisions/action items inline in the raw transcript)
- Real authentication (JWT/sessions)
- Multilingual support, speaker diarization, video/visual analysis (from the original paper)

**Technical debt / potential bugs to know about:**
- `backend/app/routes/test.py` exists but is **never registered** in `main.py` — dead code, but if someone registers it later, note that its one endpoint inserts a hardcoded test user with no auth check at all
- No automated tests exist anywhere in the project (no `pytest`, no test files) — this is the most consequential gap for anyone extending the project, since every fix so far has been verified by manual/simulated runs rather than a real test suite
- `frontend/assets/js/summary.js` still reads the older `meeting.summary` field (from the simple inline-text summarizer that predates the dedicated Meeting Summarization module) rather than the richer `SummaryDB` data — the two summarization paths currently coexist rather than being fully unified
- CORS is wide open (`*`) — fine for local dev, must be tightened before any real deployment
- No rate limiting on the Groq-calling endpoints — a user could spam `/summarize` calls and burn through API quota

---

## 13. Honest Project Review

**Strengths**
- Clean, conventional FastAPI layering (models/schemas/routes/services) — easy for a new contributor to navigate
- The AI summarization is genuinely useful and well-structured (10 distinct fields, not just one blob of text)
- The extension → auto-create-meeting → pre-filled-summary-page flow is a nice piece of product thinking, not just a token integration
- Consistent dark/indigo visual theme across every page

**Weaknesses**
- No real authentication — this is the thing most likely to get flagged hard by a technical examiner
- No automated tests
- Some genuine duplication (two summarization code paths — the old inline `meeting.summary`/`meeting.text` fields and the newer `TranscriptDB`/`SummaryDB` tables — that were never fully merged)
- SQLite + no indexes beyond PKs won't scale past a handful of concurrent users, but that's appropriate for the project's scope

**Code Quality:** Good for a project at this stage — consistent naming, docstrings on the trickier functions (e.g. why migrations run in a specific order), input validation on both frontend and backend. Not production-grade (no tests, no structured logging, no error-tracking).

**Architecture:** Sound, conventional, easy to extend. The AI service being isolated in one file (`ai_summary.py`) is a good decision — swapping providers later only touches one file.

**UI/UX:** Consistent theme, sensible empty/loading states on the newer pages (Meeting Summarization). Older pages (profile, settings) are functional but plain.

**AI Features:** Above-average for a student project — most similar projects stop at "one summary paragraph"; this one has 10 structured fields plus a working per-meeting chat.

**Scalability:** Low, by design (SQLite, no auth, no caching, no background job queue for long-running audio transcription). Appropriate for the stated scope; would need real infrastructure work to go further.

**Maintainability:** Good, thanks to the layered structure. Would improve a lot with: automated tests, resolving the "two summarization paths" duplication, and adding basic logging.

**Security:** The weakest area — no real auth, permissive CORS, plaintext `user_id` trust. Named plainly here so it isn't a surprise later.

**Performance:** Fine for the expected load (one user, one request at a time in a demo). The 8000-character transcript cap and single-call JSON-mode summarization keep Groq latency reasonable (a few seconds per summarize click).

**Overall rating (as a university final-year project):** Solidly in the 8-9/10 range on execution and AI depth, held back mainly by the missing test suite and the auth gap if an examiner probes on either. Both are honestly explainable as deliberate scope decisions for a project of this size, not oversights, as long as you can articulate that in a viva.

---

## 14. Learning / Viva Guide

### How to explain each module in one sentence
- **auth.py** — "Handles signup and login; hashes passwords with pbkdf2_sha256; doesn't issue tokens, so authorization elsewhere is just an ownership check on `user_id`."
- **meeting.py (routes)** — "Standard CRUD for scheduled meetings, scoped per user."
- **summarization.py (routes)** — "The core feature: turns a transcript into a stored, structured AI summary, and answers questions about it."
- **ai_summary.py** — "The only file that talks to Groq — transcription, structured summarization, and per-meeting chat all live here."
- **database.py** — "Sets up the SQLite engine and runs lightweight `ALTER TABLE` migrations after the tables are created."

### Likely viva questions and how to answer them

**Q: Why SQLite instead of PostgreSQL/MySQL?**
A: Zero setup for a local/demo project; SQLAlchemy makes it a one-line swap to a real database later if needed.

**Q: How is a password kept secure?**
A: Hashed with `pbkdf2_sha256` via Passlib before storage; verified with `pwd_context.verify()` at login; never stored or transmitted in plaintext.

**Q: Is this application secure?**
A: Be honest — no. There's no token-based authentication; every request just trusts a `user_id` field it's given. That's the known, named limitation, and the clear next step if the project continued.

**Q: How does the AI summarization actually work — is it a custom-trained model?**
A: No — it's a general-purpose LLM (Llama 3 8B via Groq) prompted to return a specific JSON structure. All of the "intelligence" comes from prompt design, not model training.

**Q: Does the AI chat search across all my meetings?**
A: No — deliberately scoped to one meeting at a time, by feeding that meeting's transcript directly into the prompt. Cross-meeting search would need an embeddings/vector-database layer, which wasn't built.

**Q: How does the Chrome extension get the transcript into the app without a manual upload?**
A: It POSTs the transcript to the same backend endpoint the web page uses, which auto-creates a Meeting + Transcript row, then opens the web app to the summarization page with `?transcript_id=` in the URL — the page reads that and pre-fills the form. No file is manually re-uploaded.

**Q: Why doesn't the app do speaker diarization / video processing like the research paper describes?**
A: That was the paper's aspirational full scope; the implemented system works from text/audio transcripts directly, which is both simpler to build reliably and avoids needing heavyweight video/audio-processing infrastructure. Speaker diarization specifically would need a dedicated model (e.g. pyannote.audio) that wasn't integrated.

**Q: What would you improve first if you kept working on this?**
A: Real authentication (JWT), then automated tests, then resolving the duplicate "old inline summary" vs. "new TranscriptDB/SummaryDB" code paths.

### Common mistakes to avoid when presenting this project
- Don't claim the AI does "custom NLP preprocessing" (stopword removal, lemmatization) — it doesn't; be ready to say the LLM handles that implicitly instead.
- Don't claim there's "secure authentication" — there's password hashing, but no session/token security.
- Don't claim the chat "searches all your meetings" — it's explicitly per-meeting.

### Files to have memorized before a viva
`main.py`, `database.py`, `models/summary.py`, `routes/summarization.py`, `services/ai_summary.py`, `manifest.json`, `popup.js` — these seven files cover essentially every "how does X work" question you're likely to get.

---

## 15. Complete Project Map

```
                         ┌───────────────────────────┐
                         │   Chrome Extension          │
                         │ popup.js / content.js /     │
                         │ background.js                │
                         └──────────────┬───────────────┘
                                        │ POST /summarization/transcripts
                                        │ opens meeting-summarization.html?transcript_id=
                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Frontend (static HTML/JS)                    │
│                                                                        │
│  login/signup ──► dashboard ──► add/edit-meeting ──► calendar          │
│                        │                                              │
│                        └──► future/present/past-meetings (meetings.js)│
│                        │                                              │
│                        └──► meeting-summarization.html ◄── (extension)│
│                                    │                                  │
│                                    └──► summary.html (older, simpler) │
└───────────────────────┬────────────────────────────────────────────┘
                         │ fetch() — JSON / multipart form-data
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (main.py)                        │
│                                                                        │
│   routes/auth.py ──────┐                                              │
│   routes/meeting.py ───┼──► models/*.py ──► SQLAlchemy ──► meeting.db │
│   routes/summarization.py                                             │
│              │                                                        │
│              └──► services/ai_summary.py ──► Groq API                 │
│                      (chat completions + Whisper transcription)       │
└──────────────────────────────────────────────────────────────────────┘
```

**How every piece connects, in one paragraph:** the frontend and the Chrome extension are two separate clients of the *same* backend API — neither talks to the database directly. The backend's routes layer is thin (validate, call the DB or a service, return a schema); all AI logic is isolated in one service file so the rest of the app doesn't need to know or care which AI provider is behind it. The database has one table per real-world concept (user, meeting, transcript, summary), linked by foreign keys, with the transcript↔summary relationship being the one genuinely new piece of schema this project's AI feature required.
