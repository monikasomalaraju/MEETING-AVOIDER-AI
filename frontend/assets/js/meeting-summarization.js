window.API_URL = window.API_URL || "http://127.0.0.1:8000";

let msActiveTab = "text";
let msLastResult = null;   // holds the last transcript+summary payload for copy/download/chat/print
let msCurrentTranscriptId = null; // set when arriving via ?transcript_id= (e.g. from the extension)
let msProgressTimer = null;
let msProgressIndex = 0;

const MS_STEP_COUNT = 8; // matches the <li data-step="0..7"> list in the HTML

function msGetUser() {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!user) {
        alert("Please login first");
        window.location.href = "login.html";
        return null;
    }
    return user;
}

function msShowToast(message, type) {
    const toast = document.getElementById("ms-toast");
    toast.textContent = message;
    toast.className = `ms-toast show ${type}`;
    setTimeout(() => toast.classList.remove("show"), 5000);
}

function msSwitchTab(tab) {
    msActiveTab = tab;
    document.querySelectorAll(".ms-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.getElementById("tab-text").style.display = tab === "text" ? "block" : "none";
    document.getElementById("tab-audio").style.display = tab === "audio" ? "block" : "none";
    document.getElementById("err-source").textContent = "";
}

/* ---------------- AI progress workflow (step list) ---------------- */

function msResetProgressSteps() {
    document.querySelectorAll("#msProgressSteps li").forEach(li => {
        li.classList.remove("ms-step-active", "ms-step-done");
    });
}

function msSetStep(index, state) {
    const li = document.querySelector(`#msProgressSteps li[data-step="${index}"]`);
    if (!li) return;
    li.classList.toggle("ms-step-active", state === "active");
    li.classList.toggle("ms-step-done", state === "done");
}

function msStartProgressSteps() {
    msResetProgressSteps();
    msProgressIndex = 0;
    msSetStep(0, "active");

    clearInterval(msProgressTimer);
    msProgressTimer = setInterval(() => {
        // Advance up to (but not including) the final "Completed" step —
        // that one only gets marked done once the real API response lands,
        // via msFinishProgressSteps(). This simulated pacing gives the
        // "intelligent AI workflow" feel without claiming to reflect real
        // granular progress from a single API call.
        if (msProgressIndex >= MS_STEP_COUNT - 2) return;
        msSetStep(msProgressIndex, "done");
        msProgressIndex += 1;
        msSetStep(msProgressIndex, "active");
    }, 850);
}

function msFinishProgressSteps(onDone) {
    clearInterval(msProgressTimer);
    // Rapidly catch up any remaining steps so it doesn't look like it
    // skipped straight to "Completed" if the API responded quickly.
    let i = msProgressIndex;
    const catchUp = setInterval(() => {
        msSetStep(i, "done");
        i += 1;
        if (i < MS_STEP_COUNT) {
            msSetStep(i, "active");
        } else {
            clearInterval(catchUp);
            setTimeout(onDone, 300);
            return;
        }
        if (i === MS_STEP_COUNT - 1) {
            // final "Completed" step
            setTimeout(() => msSetStep(i, "done"), 150);
        }
    }, 120);
}

function msSetLoading(isLoading) {
    document.getElementById("msEmptyState").style.display = isLoading ? "none" : (msLastResult ? "none" : "flex");
    document.getElementById("msLoading").style.display = isLoading ? "flex" : "none";
    document.getElementById("msSummarizeBtn").disabled = isLoading;
    if (isLoading) msStartProgressSteps();
}

/* ---------------- Validation ---------------- */

function msValidate() {
    if (msCurrentTranscriptId) return true;

    let valid = true;

    const title = document.getElementById("msTitle").value.trim();
    const titleErr = document.getElementById("err-title");
    if (!title) {
        titleErr.textContent = "Meeting title is required.";
        valid = false;
    } else {
        titleErr.textContent = "";
    }

    const sourceErr = document.getElementById("err-source");
    sourceErr.textContent = "";

    if (msActiveTab === "text") {
        const file = document.getElementById("msTranscriptFile").files[0];
        const text = document.getElementById("msTranscriptText").value.trim();
        if (!file && !text) {
            sourceErr.textContent = "Upload a transcript file or paste transcript text.";
            valid = false;
        }
    } else {
        const audio = document.getElementById("msAudioFile").files[0];
        if (!audio) {
            sourceErr.textContent = "Please choose an audio file to upload.";
            valid = false;
        } else if (audio.size > 25 * 1024 * 1024) {
            sourceErr.textContent = "Audio file exceeds the 25MB limit.";
            valid = false;
        }
    }

    return valid;
}

async function msReadTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not read the transcript file."));
        reader.readAsText(file);
    });
}

/* ---------------- Load existing transcript (extension handoff) ---------------- */

async function msLoadExistingTranscript(transcriptId, user) {
    try {
        const res = await fetch(`${window.API_URL}/summarization/transcripts/${transcriptId}?user_id=${user.id}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Could not load that transcript.");

        msCurrentTranscriptId = body.id;

        document.getElementById("msTitle").value = body.title || "";
        document.getElementById("msDate").value = body.meeting_date || "";
        document.getElementById("msParticipants").value = body.participants || "";
        document.getElementById("msDuration").value = body.duration || "";

        msSwitchTab("text");
        document.getElementById("msTranscriptText").value = body.raw_text || "";

        msShowToast("Transcript loaded — click Summarize to generate AI insights.", "success");

        if (body.summary) {
            msLastResult = body;
            msRenderResult(body);
        }
    } catch (err) {
        msShowToast(err.message || "Could not load the transcript from the link.", "error");
    }
}

/* ---------------- Summarize ---------------- */

async function msSummarize() {
    if (!msValidate()) return;

    const user = msGetUser();
    if (!user) return;

    msSetLoading(true);

    try {
        let transcriptId = msCurrentTranscriptId;

        if (!transcriptId) {
            const title = document.getElementById("msTitle").value.trim();
            const date = document.getElementById("msDate").value;
            const participants = document.getElementById("msParticipants").value.trim();
            const duration = document.getElementById("msDuration").value.trim();

            const formData = new FormData();
            formData.append("user_id", user.id);
            formData.append("title", title);
            if (date) formData.append("meeting_date", date);
            if (participants) formData.append("participants", participants);
            if (duration) formData.append("duration", duration);

            if (msActiveTab === "audio") {
                const audioFile = document.getElementById("msAudioFile").files[0];
                formData.append("audio", audioFile);
            } else {
                const file = document.getElementById("msTranscriptFile").files[0];
                let text = document.getElementById("msTranscriptText").value.trim();
                if (file) {
                    text = await msReadTextFile(file);
                }
                formData.append("text", text);
            }

            const createRes = await fetch(`${window.API_URL}/summarization/transcripts`, {
                method: "POST",
                body: formData,
            });

            const createBody = await createRes.json();
            if (!createRes.ok) {
                throw new Error(createBody.detail || "Failed to process the transcript.");
            }

            transcriptId = createBody.id;
            msCurrentTranscriptId = transcriptId;
        }

        const summarizeRes = await fetch(`${window.API_URL}/summarization/summarize/${transcriptId}`, {
            method: "POST",
        });

        const summarizeBody = await summarizeRes.json();
        if (!summarizeRes.ok) {
            throw new Error(summarizeBody.detail || "Failed to generate summary.");
        }

        msLastResult = summarizeBody;

        msFinishProgressSteps(() => {
            document.getElementById("msLoading").style.display = "none";
            msRenderResult(summarizeBody);
            msShowToast("Summary generated successfully.", "success");
        });

    } catch (err) {
        clearInterval(msProgressTimer);
        document.getElementById("msLoading").style.display = "none";
        document.getElementById("msEmptyState").style.display = msLastResult ? "none" : "flex";
        msShowToast(err.message || "Something went wrong.", "error");
    } finally {
        document.getElementById("msSummarizeBtn").disabled = false;
    }
}

/* ---------------- Rendering ---------------- */

function msRenderList(elementId, items) {
    const el = document.getElementById(elementId);
    el.innerHTML = "";
    const clean = (items || []).map(i => i.trim()).filter(Boolean);
    if (clean.length === 0) {
        el.innerHTML = `<li class="ms-none">None</li>`;
        return;
    }
    clean.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        el.appendChild(li);
    });
}

function msRenderChips(elementId, items) {
    const el = document.getElementById(elementId);
    el.innerHTML = "";
    const clean = (items || []).map(i => i.trim()).filter(Boolean);
    if (clean.length === 0) {
        el.innerHTML = `<span class="ms-none">None</span>`;
        return;
    }
    clean.forEach(item => {
        const chip = document.createElement("span");
        chip.className = "ms-chip";
        chip.textContent = item;
        el.appendChild(chip);
    });
}

function msRenderResult(data) {
    document.getElementById("msEmptyState").style.display = "none";
    const contentEl = document.getElementById("msResultContent");
    contentEl.style.display = "block";
    contentEl.classList.remove("ms-fade-in");
    void contentEl.offsetWidth; // restart animation
    contentEl.classList.add("ms-fade-in");

    document.getElementById("msResultTitle").textContent = data.title;

    const metaParts = [];
    if (data.meeting_date) metaParts.push(data.meeting_date);
    if (data.duration) metaParts.push(data.duration);
    if (data.participants) metaParts.push(data.participants);
    metaParts.push(`Source: ${data.source_type}`);
    document.getElementById("msResultMeta").textContent = metaParts.join(" • ");

    const summary = data.summary || {
        executive_summary: "", outcome: "", overall_summary: "", key_points: [], decisions: [],
        action_items: [], deadlines: [], risks: [], next_steps: [], keywords: [], category: "",
    };

    const categoryBadge = document.getElementById("msCategoryBadge");
    if (summary.category) {
        categoryBadge.textContent = summary.category;
        categoryBadge.style.display = "inline-block";
    } else {
        categoryBadge.style.display = "none";
    }

    const outcomeBanner = document.getElementById("msOutcomeBanner");
    if (summary.outcome) {
        document.getElementById("msOutcome").textContent = summary.outcome;
        outcomeBanner.style.display = "flex";
    } else {
        outcomeBanner.style.display = "none";
    }

    document.getElementById("msExecutiveSummary").textContent = summary.executive_summary || "No executive summary available.";
    document.getElementById("msOverallSummary").textContent = summary.overall_summary || "No summary available.";

    const participantsList = (data.participants || "").split(",").map(p => p.trim()).filter(Boolean);
    msRenderChips("msParticipantsChips", participantsList);

    msRenderList("msKeyPoints", summary.key_points);
    msRenderList("msDecisions", summary.decisions);
    msRenderList("msActionItems", summary.action_items);
    msRenderList("msDeadlines", summary.deadlines);
    msRenderList("msRisks", summary.risks);
    msRenderList("msNextSteps", summary.next_steps);
    msRenderChips("msKeywords", summary.keywords);

    document.getElementById("msChatLog").innerHTML = "";

    msRenderHighlightedTranscript(data.raw_text || "", summary, participantsList);
}

/* ---------------- Smart Highlights ----------------
   Heuristic, pattern-based highlighting — NOT a claim of perfect NLP entity
   extraction. Keywords and participant names are matched by literal
   substring (they're likely to appear verbatim). Deadlines/decisions/action
   items are matched by common trigger phrases/regex, since the AI summary's
   bullets are paraphrased and usually won't appear verbatim in the raw
   transcript to match against directly. */

function msEscapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function msEscapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function msFindSubstringMatches(text, phrase, className, targetId, maxMatches = 2) {
    const matches = [];
    if (!phrase || phrase.length < 3) return matches;
    const re = new RegExp(msEscapeRegex(phrase), "gi");
    let m;
    let count = 0;
    while ((m = re.exec(text)) !== null && count < maxMatches) {
        matches.push({ start: m.index, end: m.index + m[0].length, className, targetId });
        count += 1;
    }
    return matches;
}

function msFindRegexMatches(text, regex, className, targetId, maxMatches = 6) {
    const matches = [];
    let m;
    let count = 0;
    while ((m = regex.exec(text)) !== null && count < maxMatches) {
        matches.push({ start: m.index, end: m.index + m[0].length, className, targetId });
        count += 1;
        if (m[0].length === 0) regex.lastIndex += 1; // avoid infinite loop on zero-width matches
    }
    return matches;
}

function msRenderHighlightedTranscript(rawText, summary, participants) {
    const panel = document.getElementById("msTranscriptPanel");
    const box = document.getElementById("msHighlightedTranscript");

    if (!rawText || !rawText.trim()) {
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";

    let matches = [];

    (summary.keywords || []).forEach(kw => {
        matches = matches.concat(msFindSubstringMatches(rawText, kw.trim(), "hl-keyword", "msKeywordsCard"));
    });

    participants.forEach(name => {
        matches = matches.concat(msFindSubstringMatches(rawText, name, "hl-person", "msParticipantsCard"));
    });

    const deadlineRegex = /\b(deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of (day|week|month)|[A-Z][a-z]+ \d{1,2}(st|nd|rd|th)?)|due (on|by)?\s?\w*)\b/gi;
    matches = matches.concat(msFindRegexMatches(rawText, deadlineRegex, "hl-deadline", "msDeadlinesCard"));

    const decisionRegex = /\b(decided|agreed|approved|finalized|we will go with|concluded that)\b/gi;
    matches = matches.concat(msFindRegexMatches(rawText, decisionRegex, "hl-decision", "msDecisionsCard"));

    const actionRegex = /\b(action item|assigned to|will (handle|take|build|work on|complete|finish|own|lead|write|prepare)|responsible for|to-?do)\b/gi;
    matches = matches.concat(msFindRegexMatches(rawText, actionRegex, "hl-action", "msActionItemsCard"));

    // Sort by start index; drop overlaps (first match found wins).
    matches.sort((a, b) => a.start - b.start);
    const cleanMatches = [];
    let lastEnd = -1;
    matches.forEach(m => {
        if (m.start >= lastEnd) {
            cleanMatches.push(m);
            lastEnd = m.end;
        }
    });

    let html = "";
    let cursor = 0;
    cleanMatches.forEach(m => {
        html += msEscapeHtml(rawText.slice(cursor, m.start));
        html += `<mark class="${m.className}" data-target="${m.targetId}">${msEscapeHtml(rawText.slice(m.start, m.end))}</mark>`;
        cursor = m.end;
    });
    html += msEscapeHtml(rawText.slice(cursor));

    box.innerHTML = html;
}

document.addEventListener("click", (e) => {
    const mark = e.target.closest("mark[data-target]");
    if (!mark) return;
    const target = document.getElementById(mark.dataset.target);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("ms-jump-flash");
    setTimeout(() => target.classList.remove("ms-jump-flash"), 1100);
});

/* ---------------- Copy / Print / Download ---------------- */

function msCopySummary() {
    if (!msLastResult) return;
    const s = msLastResult.summary || {};
    const text = [
        `Meeting: ${msLastResult.title}`,
        msLastResult.meeting_date ? `Date: ${msLastResult.meeting_date}` : "",
        msLastResult.duration ? `Duration: ${msLastResult.duration}` : "",
        msLastResult.participants ? `Participants: ${msLastResult.participants}` : "",
        s.category ? `Category: ${s.category}` : "",
        s.outcome ? `Outcome: ${s.outcome}` : "",
        "",
        "Executive Summary:",
        s.executive_summary || "None",
        "",
        "Detailed Summary:",
        s.overall_summary || "None",
        "",
        "Key Points:",
        ...(s.key_points && s.key_points.length ? s.key_points.map(p => `- ${p}`) : ["None"]),
        "",
        "Decisions:",
        ...(s.decisions && s.decisions.length ? s.decisions.map(p => `- ${p}`) : ["None"]),
        "",
        "Action Items:",
        ...(s.action_items && s.action_items.length ? s.action_items.map(p => `- ${p}`) : ["None"]),
        "",
        "Deadlines:",
        ...(s.deadlines && s.deadlines.length ? s.deadlines.map(p => `- ${p}`) : ["None"]),
        "",
        "Risks & Blockers:",
        ...(s.risks && s.risks.length ? s.risks.map(p => `- ${p}`) : ["None"]),
        "",
        "Suggested Next Steps:",
        ...(s.next_steps && s.next_steps.length ? s.next_steps.map(p => `- ${p}`) : ["None"]),
        "",
        "Keywords:",
        (s.keywords && s.keywords.length ? s.keywords.join(", ") : "None"),
    ].filter(line => line !== "").join("\n");

    navigator.clipboard.writeText(text)
        .then(() => msShowToast("Summary copied to clipboard.", "success"))
        .catch(() => msShowToast("Could not copy summary.", "error"));
}

function msPrintSummary() {
    if (!msLastResult) {
        msShowToast("Generate a summary first.", "error");
        return;
    }
    window.print();
}

function msDownloadSummary() {
    if (!msLastResult) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const s = msLastResult.summary || {};

    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN_L = 15;
    const MARGIN_R = 15;
    const MARGIN_TOP = 20;
    const MARGIN_BOTTOM = 20; // reserved space at the bottom for the footer/page number
    const TEXT_WIDTH = PAGE_W - MARGIN_L - MARGIN_R;

    let y = MARGIN_TOP;
    let pageCount = 1;

    function addFooter() {
        const prevFontSize = doc.getFontSize();
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Page ${pageCount}`, PAGE_W - MARGIN_R, PAGE_H - 10, { align: "right" });
        doc.text("Meeting Avoider AI", MARGIN_L, PAGE_H - 10);
        doc.setFontSize(prevFontSize);
        doc.setTextColor(0);
    }

    function newPage() {
        addFooter();
        doc.addPage();
        pageCount += 1;
        y = MARGIN_TOP;
    }

    // Ensures there's room for the next block; starts a new page first if not.
    function ensureSpace(neededHeight) {
        if (y + neededHeight > PAGE_H - MARGIN_BOTTOM) {
            newPage();
        }
    }

    function addLine(text, size = 11, gap = 6, opts = {}) {
        doc.setFontSize(size);
        doc.setFont(undefined, opts.bold ? "bold" : "normal");
        const lines = doc.splitTextToSize(String(text ?? ""), TEXT_WIDTH);
        const blockHeight = lines.length * gap;

        // Page-break check runs BEFORE drawing, and per wrapped line, so a
        // long paragraph correctly splits across pages instead of being
        // drawn past the bottom margin (the original bug: text silently
        // ran off the visible page with no addPage() call at all).
        if (blockHeight > PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) {
            // Block is taller than a full page - draw line by line, page-breaking as needed.
            lines.forEach((line) => {
                ensureSpace(gap);
                doc.text(line, MARGIN_L, y);
                y += gap;
            });
        } else {
            ensureSpace(blockHeight);
            doc.text(lines, MARGIN_L, y);
            y += blockHeight;
        }
        doc.setFont(undefined, "normal");
    }

    function addHeading(text) {
        y += 3;
        ensureSpace(10);
        doc.setDrawColor(99, 102, 241);
        doc.setLineWidth(0.6);
        doc.line(MARGIN_L, y, MARGIN_L + 8, y);
        addLine(text, 13, 7, { bold: true });
        y += 1;
    }

    function addSection(heading, items) {
        addHeading(heading);
        const clean = (items || []).filter((i) => i && i.trim());
        if (clean.length === 0) {
            addLine("None", 10.5, 6);
        } else {
            clean.forEach((p) => addLine(`•  ${p}`, 10.5, 6));
        }
        y += 3;
    }

    // ---- Header ----
    addLine(msLastResult.title || "Untitled Meeting", 18, 9, { bold: true });
    const metaBits = [];
    if (msLastResult.meeting_date) metaBits.push(`Date: ${msLastResult.meeting_date}`);
    if (msLastResult.duration) metaBits.push(`Duration: ${msLastResult.duration}`);
    if (s.category) metaBits.push(`Category: ${s.category}`);
    if (metaBits.length) addLine(metaBits.join("   |   "), 10, 6);
    if (msLastResult.participants) addLine(`Participants: ${msLastResult.participants}`, 10, 6);
    y += 3;

    // ---- Outcome (highlighted one-liner) ----
    if (s.outcome && s.outcome.trim()) {
        addHeading("Outcome");
        addLine(s.outcome, 11, 6);
        y += 3;
    }

    // ---- Executive Summary ----
    addHeading("Executive Summary");
    addLine(s.executive_summary || "None", 10.5, 6);
    y += 3;

    // ---- Detailed Summary ----
    addHeading("Detailed Summary");
    addLine(s.overall_summary || "None", 10.5, 6);
    y += 3;

    // ---- All structured list sections (every field, none skipped) ----
    addSection("Key Points", s.key_points);
    addSection("Decisions", s.decisions);
    addSection("Action Items", s.action_items);
    addSection("Deadlines", s.deadlines);
    addSection("Risks & Blockers", s.risks);
    addSection("Suggested Next Steps", s.next_steps);

    // ---- Keywords ----
    addHeading("Keywords");
    addLine(s.keywords && s.keywords.length ? s.keywords.join(", ") : "None", 10.5, 6);

    // Footer on the final page (earlier pages already got theirs via newPage()).
    addFooter();

    doc.save(`${msLastResult.title || "meeting-summary"}.pdf`);
}

/* ---------------- Chat ---------------- */

function msAppendChatMessage(role, text) {
    const log = document.getElementById("msChatLog");
    const bubble = document.createElement("div");
    bubble.className = `ms-chat-msg ${role}`;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
}

async function msSendChatMessage() {
    if (!msLastResult) {
        msShowToast("Generate a summary first, then you can ask questions about it.", "error");
        return;
    }

    const user = msGetUser();
    if (!user) return;

    const input = document.getElementById("msChatInput");
    const question = input.value.trim();
    if (!question) return;

    msAppendChatMessage("user", question);
    input.value = "";

    const sendBtn = document.getElementById("msChatSendBtn");
    sendBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append("user_id", user.id);
        formData.append("question", question);

        const res = await fetch(`${window.API_URL}/summarization/chat/${msLastResult.id}`, {
            method: "POST",
            body: formData,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Could not get an answer.");

        msAppendChatMessage("assistant", body.answer);

    } catch (err) {
        msAppendChatMessage("assistant", err.message || "Something went wrong answering that.");
    } finally {
        sendBtn.disabled = false;
    }
}

/* ---------------- Clear ---------------- */

function msClearForm() {
    document.getElementById("msTitle").value = "";
    document.getElementById("msDate").value = "";
    document.getElementById("msDuration").value = "";
    document.getElementById("msParticipants").value = "";
    document.getElementById("msTranscriptFile").value = "";
    document.getElementById("msTranscriptText").value = "";
    document.getElementById("msAudioFile").value = "";
    document.getElementById("err-title").textContent = "";
    document.getElementById("err-source").textContent = "";

    msLastResult = null;
    msCurrentTranscriptId = null;
    document.getElementById("msChatLog").innerHTML = "";
    document.getElementById("msResultContent").style.display = "none";
    document.getElementById("msTranscriptPanel").style.display = "none";
    document.getElementById("msEmptyState").style.display = "flex";

    const url = new URL(window.location.href);
    url.searchParams.delete("transcript_id");
    window.history.replaceState({}, "", url);
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".ms-tab").forEach(btn => {
        btn.addEventListener("click", () => msSwitchTab(btn.dataset.tab));
    });

    document.getElementById("msSummarizeBtn").addEventListener("click", msSummarize);
    document.getElementById("msClearBtn").addEventListener("click", msClearForm);
    document.getElementById("msCopyBtn").addEventListener("click", msCopySummary);
    document.getElementById("msPrintBtn").addEventListener("click", msPrintSummary);
    document.getElementById("msDownloadBtn").addEventListener("click", msDownloadSummary);
    document.getElementById("msChatSendBtn").addEventListener("click", msSendChatMessage);
    document.getElementById("msChatInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") msSendChatMessage();
    });

    const params = new URLSearchParams(window.location.search);
    const transcriptId = params.get("transcript_id");
    if (transcriptId) {
        const user = msGetUser();
        if (user) msLoadExistingTranscript(transcriptId, user);
    }
});
