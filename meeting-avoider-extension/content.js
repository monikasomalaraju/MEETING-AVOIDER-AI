// Best-effort transcript/caption capture for supported meeting platforms.
// This intentionally does NOT try to hook into internal APIs, websockets, or
// any undocumented platform behavior — it only reads text that is already
// visibly rendered on the page (e.g. live caption panels). If nothing is
// found, the popup asks the user to paste the transcript manually instead.

function captureGoogleMeetCaptions() {
    // Google Meet renders live captions in a region generally reachable via
    // aria-label="Captions" — selector kept broad since Meet's class names
    // are obfuscated/rotate frequently.
    const candidates = document.querySelectorAll(
        '[aria-label="Captions"] *, [jsname][aria-live], div[class*="caption"]'
    );

    const seen = new Set();
    const lines = [];

    candidates.forEach((el) => {
        const text = (el.innerText || "").trim();
        if (text && text.length > 1 && !seen.has(text)) {
            seen.add(text);
            lines.push(text);
        }
    });

    return lines.join("\n");
}

function captureZoomCaptions() {
    const candidates = document.querySelectorAll(
        '[class*="live-transcription"], [class*="caption"]'
    );
    const seen = new Set();
    const lines = [];

    candidates.forEach((el) => {
        const text = (el.innerText || "").trim();
        if (text && text.length > 1 && !seen.has(text)) {
            seen.add(text);
            lines.push(text);
        }
    });

    return lines.join("\n");
}

function captureTeamsCaptions() {
    const candidates = document.querySelectorAll(
        '[data-tid*="closed-caption"], [class*="caption"]'
    );
    const seen = new Set();
    const lines = [];

    candidates.forEach((el) => {
        const text = (el.innerText || "").trim();
        if (text && text.length > 1 && !seen.has(text)) {
            seen.add(text);
            lines.push(text);
        }
    });

    return lines.join("\n");
}

function captureTranscript() {
    const host = window.location.hostname;

    if (host.includes("meet.google.com")) return captureGoogleMeetCaptions();
    if (host.includes("zoom.us")) return captureZoomCaptions();
    if (host.includes("teams.microsoft.com")) return captureTeamsCaptions();

    return "";
}

function inferMeetingTitle() {
    // Best-effort: use the tab/document title, trimmed of platform suffixes
    // like " - Google Meet" or " | Microsoft Teams".
    return (document.title || "")
        .replace(/\s*[-|]\s*(Google Meet|Zoom|Microsoft Teams).*$/i, "")
        .trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "MA_CAPTURE_TRANSCRIPT") {
        try {
            const text = captureTranscript();
            sendResponse({ text, title: inferMeetingTitle(), url: window.location.href });
        } catch (err) {
            sendResponse({ text: "", title: "", url: window.location.href });
        }
    }
    // Return true only if we needed to respond asynchronously; here we
    // respond synchronously above, so no return value is required.
});
