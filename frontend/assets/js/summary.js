window.API_URL = window.API_URL || "http://127.0.0.1:8000";

let hsAllItems = [];
let hsActiveFilter = "all";

function hsShowToast(message, type) {
    const toast = document.getElementById("hs-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `ms-toast show ${type}`;
    setTimeout(() => toast.classList.remove("show"), 5000);
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function hsGetUser() {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!user) {
        window.location.href = "login.html";
        return null;
    }
    return user;
}

async function loadSummaryPage() {
    const user = hsGetUser();
    if (!user) return;

    const status = document.getElementById("hsStatus");

    try {
        const res = await fetch(`${window.API_URL}/summarization/history/${user.id}`);
        if (!res.ok) {
            status.textContent = "Unable to load meeting history right now.";
            return;
        }

        hsAllItems = await res.json();
        status.style.display = "none";
        hsRender();

    } catch (err) {
        status.textContent = "Something went wrong while loading meeting history.";
        console.error(err);
    }
}

function hsApplyFilter(items) {
    if (hsActiveFilter === "summarized") {
        return items.filter(i => i.has_summary);
    }
    if (hsActiveFilter === "recent") {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return items.filter(i => new Date(i.created_at).getTime() >= cutoff);
    }
    return items;
}

function hsRender() {
    const grid = document.getElementById("hsGrid");
    const empty = document.getElementById("hsEmpty");
    const items = hsApplyFilter(hsAllItems);

    if (hsAllItems.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        return;
    }
    empty.style.display = "none";

    if (items.length === 0) {
        grid.innerHTML = `<p class="ms-hint" style="grid-column:1/-1;">No meetings match this filter.</p>`;
        return;
    }

    grid.innerHTML = "";
    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "hs-card";

        const metaBits = [];
        if (item.meeting_date) metaBits.push(escapeHtml(item.meeting_date));
        if (item.duration) metaBits.push(escapeHtml(item.duration));
        metaBits.push(item.source_type === "audio" ? "Audio" : "Text");

        const previewHtml = item.preview
            ? `<div class="hs-preview">${escapeHtml(item.preview)}</div>`
            : `<div class="hs-preview hs-preview-empty">${item.has_summary ? "No preview available." : "Not summarized yet — click Generate to create one."}</div>`;

        card.innerHTML = `
            <div class="hs-card-top">
                <div class="hs-card-title">🤖 ${escapeHtml(item.title)}</div>
                <span class="hs-badge ${item.has_summary ? "summarized" : "pending"}">${item.has_summary ? (item.category || "Summarized") : "Pending"}</span>
            </div>
            <div class="hs-meta">${metaBits.join(" • ")}</div>
            ${previewHtml}
            <div class="hs-stats">
                <span><i class="fa-solid fa-square-check"></i> ${item.action_items_count} Actions</span>
                <span><i class="fa-solid fa-gavel"></i> ${item.decisions_count} Decisions</span>
                <span><i class="fa-solid fa-hourglass-half"></i> ${item.deadlines_count} Deadlines</span>
            </div>
            <div class="hs-actions">
                <a href="meeting-summarization.html?transcript_id=${item.id}">${item.has_summary ? "View Summary" : "Generate"}</a>
                ${item.has_summary ? `<button type="button" data-pdf-id="${item.id}">Download PDF</button>` : ""}
            </div>
        `;

        const pdfBtn = card.querySelector("[data-pdf-id]");
        if (pdfBtn) {
            pdfBtn.addEventListener("click", () => hsDownloadPdf(item.id, pdfBtn));
        }

        grid.appendChild(card);
    });
}

async function hsDownloadPdf(transcriptId, btn) {
    const user = hsGetUser();
    if (!user) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Preparing...";

    try {
        const res = await fetch(`${window.API_URL}/summarization/transcripts/${transcriptId}?user_id=${user.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not load this meeting.");

        hsBuildPdf(data);

    } catch (err) {
        hsShowToast(err.message || "Could not generate the PDF.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/* Same robust, page-breaking PDF builder as meeting-summarization.js —
   duplicated here since this project has no module bundler to share it
   from. Keep both in sync if the PDF layout changes. */
function hsBuildPdf(transcript) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const s = transcript.summary || {};

    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN_L = 15, MARGIN_R = 15, MARGIN_TOP = 20, MARGIN_BOTTOM = 20;
    const TEXT_WIDTH = PAGE_W - MARGIN_L - MARGIN_R;

    let y = MARGIN_TOP;
    let pageCount = 1;

    function addFooter() {
        const prevSize = doc.getFontSize();
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Page ${pageCount}`, PAGE_W - MARGIN_R, PAGE_H - 10, { align: "right" });
        doc.text("Meeting Avoider AI", MARGIN_L, PAGE_H - 10);
        doc.setFontSize(prevSize);
        doc.setTextColor(0);
    }
    function newPage() {
        addFooter();
        doc.addPage();
        pageCount += 1;
        y = MARGIN_TOP;
    }
    function ensureSpace(needed) {
        if (y + needed > PAGE_H - MARGIN_BOTTOM) newPage();
    }
    function addLine(text, size = 11, gap = 6, opts = {}) {
        doc.setFontSize(size);
        doc.setFont(undefined, opts.bold ? "bold" : "normal");
        const lines = doc.splitTextToSize(String(text ?? ""), TEXT_WIDTH);
        const blockHeight = lines.length * gap;
        if (blockHeight > PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) {
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
        if (clean.length === 0) addLine("None", 10.5, 6);
        else clean.forEach((p) => addLine(`•  ${p}`, 10.5, 6));
        y += 3;
    }

    addLine(transcript.title || "Untitled Meeting", 18, 9, { bold: true });
    const metaBits = [];
    if (transcript.meeting_date) metaBits.push(`Date: ${transcript.meeting_date}`);
    if (transcript.duration) metaBits.push(`Duration: ${transcript.duration}`);
    if (s.category) metaBits.push(`Category: ${s.category}`);
    if (metaBits.length) addLine(metaBits.join("   |   "), 10, 6);
    if (transcript.participants) addLine(`Participants: ${transcript.participants}`, 10, 6);
    y += 3;

    if (s.outcome && s.outcome.trim()) {
        addHeading("Outcome");
        addLine(s.outcome, 11, 6);
        y += 3;
    }

    addHeading("Executive Summary");
    addLine(s.executive_summary || "None", 10.5, 6);
    y += 3;

    addHeading("Detailed Summary");
    addLine(s.overall_summary || "None", 10.5, 6);
    y += 3;

    addSection("Key Points", s.key_points);
    addSection("Decisions", s.decisions);
    addSection("Action Items", s.action_items);
    addSection("Deadlines", s.deadlines);
    addSection("Risks & Blockers", s.risks);
    addSection("Suggested Next Steps", s.next_steps);

    addHeading("Keywords");
    addLine(s.keywords && s.keywords.length ? s.keywords.join(", ") : "None", 10.5, 6);

    addFooter();
    doc.save(`${transcript.title || "meeting-summary"}.pdf`);
}

document.addEventListener("DOMContentLoaded", () => {
    loadSummaryPage();

    document.querySelectorAll(".hs-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".hs-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            hsActiveFilter = btn.dataset.filter;
            hsRender();
        });
    });
});
