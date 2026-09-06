# Meeting Avoider AI

Meeting Avoider AI is a virtual meeting management and AI summarization system. It lets you schedule meetings, view them on a calendar, and turn a pasted transcript, uploaded file, or uploaded audio recording into a structured AI summary (executive summary, key points, decisions, action items, deadlines, risks, next steps). Each summarized meeting also has its own AI chat you can ask questions about it. A companion Chrome extension can send a transcript (text or audio) straight from your browser, and a public landing page explains the product before you sign up.

## Features

- Public landing page explaining the product, with links into Login/Sign Up
- Email/password signup & login
- **Dashboard** — real KPIs (meetings, summaries, action items, decisions), today's meetings, AI insights (most discussed topic, most frequent category), recent activity — all computed from your actual data, not placeholders
- Schedule, edit, and delete meetings (title, date, time, link, participants)
- Calendar view
- Upcoming / Today / Past meetings pages
- **AI Meeting Summarization**
  - Paste transcript text, upload a `.txt` file, or upload an audio recording (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.webm`) — audio is transcribed automatically
  - Structured output: executive summary, detailed summary, key points, decisions, action items, deadlines, risks, next steps, keywords, category, outcome
  - Per-meeting **AI chat** — ask questions grounded only in that meeting's transcript and summary
  - Copy to clipboard / print / **download a complete, multi-page PDF** — every structured field is included, long summaries correctly paginate instead of being cut off
- **Meeting History** — separate from meeting scheduling: a compact, scannable card grid of every meeting you've summarized, with action-item/decision/deadline counts and a preview; click through for the full report. Re-summarizing the same meeting (same title + date) reuses the existing meeting instead of creating a duplicate.
- **Email meeting reminders** — an optional background scheduler sends a reminder email ~10 minutes before each scheduled meeting. Runs with zero extra dependencies; safely no-ops (logs a warning, never crashes or fakes success) if SMTP isn't configured. See "Email Reminders" below.
- **Browser meeting reminders** — authenticated app pages can request browser permission and show a desktop notification ~10 minutes before a meeting. See "Browser Reminders" below.
- **Profile** — editable personal info, password change, real usage statistics, notification preference, account deletion
- **Chrome extension** (`meeting-avoider-extension/`) — log in, capture/paste a transcript or upload an audio file from your active tab, and send it; the meeting is created automatically and the summarization page opens pre-filled

## Meetings vs. Meeting History

These are two intentionally different areas:

- **Meetings** (sidebar) — your scheduling/management area: Upcoming, Today, and Past tabs, plus Add/Edit/Delete. This is about *when* a meeting happens.
- **Meeting History** (sidebar) — your knowledge/review area: every meeting you've generated a transcript+summary for, shown as compact cards you can browse quickly. This is about *what came out of* a meeting.

A meeting only ever has one row in the database no matter how many times you summarize it — see "Known Limitations" for the exact matching rule used to prevent duplicates.

## Email Reminders

Set these in `backend/.env` (see `.env.example`) to enable real reminder emails:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
FROM_EMAIL=your_email@gmail.com
```
If these are left unset, the app **runs normally** — reminders are simply skipped, with a clear warning logged to the backend console. No crash, and it never pretends an email was sent when it wasn't.

**To test the reminder workflow without real email credentials**, set:
```
NOTIFICATION_MODE=console
```
Reminders will print the full subject/body to the backend terminal instead of sending anything.

**How it works:** a lightweight background loop (built into the FastAPI app, no extra service to run) checks every 60 seconds for meetings starting in 9-11 minutes and sends one reminder each, tracked via a `reminder_sent` flag on the meeting so it's never sent twice — even across a server restart. Meeting times are compared against the server's local clock; there's no per-user time zone setting in this project.

## Browser Reminders

Browser reminders are implemented in `frontend/assets/js/browser-notifications.js` and use the existing `GET /meetings/{user_id}` endpoint. An authenticated app page requests notification permission once, then polls for upcoming meetings while that page is open. Notifications contain the meeting title, stored meeting time, and "Your meeting starts in 10 minutes." Clicking one focuses the app and opens its meeting link when available.

Normal mode checks the same 9-11 minute lead window as email reminders. For an immediate development test, set `localStorage.meetingAvoiderBrowserReminderTestSeconds` to a positive number such as `60` in the browser console, then create a meeting roughly that many seconds ahead and keep an authenticated app page open. Remove the localStorage value to return to normal timing. Already-shown browser reminders are tracked in localStorage by meeting ID, date, and time.

The website or an authenticated app page must remain open for browser polling to continue. Browser notifications are not a service-worker or push-notification system, so they are not guaranteed when the website/browser is completely closed. Email reminders remain independent and continue to use the backend scheduler.

## Technologies Used

**Backend:** Python, FastAPI, SQLAlchemy, SQLite, Passlib (`pbkdf2_sha256`), Groq API (`openai/gpt-oss-20b` for summarization, `whisper-large-v3` for audio transcription)

**Frontend:** HTML, CSS, vanilla JavaScript, jsPDF (via CDN) — no build step required

**Extension:** Chrome Manifest V3 (popup, content script, background service worker)

> Note: this project has **no `package.json` / npm build step** on either the frontend or backend — the frontend is plain static HTML/CSS/JS served directly by FastAPI, and the backend is a standard Python app. "Installation" below reflects that; there is no `npm install` step because there's no Node tooling in this project.

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, CORS, static file serving, page routing
    database.py           # SQLite engine + lightweight migrations
    models/                # SQLAlchemy models (user, meeting, transcript, summary)
    schemas/                # Pydantic request/response schemas
    routes/                  # auth, meeting, summarization endpoints
    services/ai_summary.py    # Groq summarization + audio transcription
  requirements.txt
  .env.example             # copy to .env and add your GROQ_API_KEY
frontend/
  pages/                    # one HTML file per page
  assets/css, assets/js, assets/images
meeting-avoider-extension/
  manifest.json, popup.html/.css/.js, content.js, background.js, icons/
```

## Installation

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env      # then edit .env and add your GROQ_API_KEY
```

Get a free Groq API key at https://console.groq.com/keys.

### 2. Run the backend

```bash
cd backend
uvicorn app.main:app --reload
```

The backend also serves the frontend directly — once it's running, open:

```
http://127.0.0.1:8000/
```

This redirects to the landing page. From there, use Get Started / Login, or go straight to a page directly, e.g. `http://127.0.0.1:8000/login.html`.

(No separate frontend server or `npm start` is required. If you prefer serving the frontend separately during development, e.g. via `python -m http.server 5500` inside `frontend/`, that also works — CORS is open.)

### 3. Chrome Extension

1. Make sure the backend is running on `http://127.0.0.1:8000`.
2. Open Chrome → `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `meeting-avoider-extension/` folder.
5. Click the extension icon, log in with your Meeting Avoider AI account, then paste/capture a transcript **or** upload an audio recording, and send it.

Live caption capture is best-effort (Google Meet / Zoom / Teams caption panels change often) — if nothing is captured, paste the transcript text manually or upload an audio file instead; both of those paths always work.

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `GROQ_API_KEY` | `backend/.env` | Required for AI summarization and audio transcription. Get one at console.groq.com. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL` | `backend/.env` | Optional. Enables real meeting-reminder emails. App runs fine without them — reminders are just skipped with a logged warning. |
| `NOTIFICATION_MODE` | `backend/.env` | Optional. Set to `console` to test reminders locally without real email credentials — prints the email instead of sending it. |
| `REMINDER_TEST_SECONDS`, `REMINDER_TEST_MINUTES` | `backend/.env` | Optional backend email test mode; leave unset for normal email timing. Browser test timing is configured in browser localStorage as described above. |

## Database

SQLite, file created automatically at `backend/meeting.db` on first run. Tables: `users`, `meetings`, `transcripts`, `summaries`.

## Known Limitations / Future Scope

- Auth is not token/JWT based (the frontend sends `user_id` directly) — fine for a local/dev project, not production-hardened
- Live caption capture in the Chrome extension is best-effort; platforms change their DOM structure without notice
- No multilingual support yet
- No speaker diarization or slide/visual analysis (the original design doc described these as future work)
- **Duplicate-meeting prevention** uses a compound match (same user + same title + same date) when auto-creating a meeting from a transcript. This is intentionally *not* a title-only match (too weak — two unrelated meetings could share a title), but it also means two genuinely different meetings on the same day with the exact same title will be treated as one. Renaming or changing the date avoids this.
- The **email reminder scheduler** runs as a single in-process background loop — appropriate for a single-server academic deployment. If ever run with multiple server processes, each would poll independently and could send duplicate reminders. It also compares meeting times against the server's local clock; there's no per-user time zone setting anywhere in the schema.

## License

For academic/educational use.
