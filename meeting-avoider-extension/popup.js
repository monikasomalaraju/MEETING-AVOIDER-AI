const API_URL = "http://127.0.0.1:8000";

const els = {
    statusBanner: document.getElementById("statusBanner"),
    loginView: document.getElementById("loginView"),
    mainView: document.getElementById("mainView"),
    loginEmail: document.getElementById("loginEmail"),
    loginPassword: document.getElementById("loginPassword"),
    loginBtn: document.getElementById("loginBtn"),
    userEmailLabel: document.getElementById("userEmailLabel"),
    logoutBtn: document.getElementById("logoutBtn"),
    meetingTitle: document.getElementById("meetingTitle"),
    captureBtn: document.getElementById("captureBtn"),
    transcriptText: document.getElementById("transcriptText"),
    audioFile: document.getElementById("audioFile"),
    sendBtn: document.getElementById("sendBtn"),
    openAppBtn: document.getElementById("openAppBtn"),
};

function showBanner(message, type) {
    els.statusBanner.textContent = message;
    els.statusBanner.className = `banner ${type}`;
    els.statusBanner.style.display = "block";
    setTimeout(() => { els.statusBanner.style.display = "none"; }, 4000);
}

function getStoredUser() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["maUser"], (result) => resolve(result.maUser || null));
    });
}

function storeUser(user) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ maUser: user }, resolve);
    });
}

function clearUser() {
    return new Promise((resolve) => {
        chrome.storage.local.remove("maUser", resolve);
    });
}

async function refreshView() {
    const user = await getStoredUser();
    if (user) {
        els.loginView.style.display = "none";
        els.mainView.style.display = "block";
        els.userEmailLabel.textContent = user.email;
    } else {
        els.loginView.style.display = "block";
        els.mainView.style.display = "none";
    }
}

async function handleLogin() {
    const email = els.loginEmail.value.trim();
    const password = els.loginPassword.value;

    if (!email || !password) {
        showBanner("Enter your email and password.", "error");
        return;
    }

    els.loginBtn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const body = await res.json();

        if (!res.ok) {
            throw new Error(body.detail || "Login failed.");
        }

        await storeUser(body.user);
        chrome.runtime.sendMessage({ type: "MA_SYNC_REMINDERS" });
        showBanner("Logged in successfully.", "success");
        await refreshView();

    } catch (err) {
        showBanner(err.message || "Could not reach the Meeting Avoider AI server. Is it running on http://127.0.0.1:8000?", "error");
    } finally {
        els.loginBtn.disabled = false;
    }
}

async function handleLogout() {
    await clearUser();
    chrome.runtime.sendMessage({ type: "MA_SYNC_REMINDERS" });
    await refreshView();
}

async function handleCapture() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            showBanner("No active tab found.", "error");
            return;
        }

        chrome.tabs.sendMessage(tab.id, { type: "MA_CAPTURE_TRANSCRIPT" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                showBanner("Live capture isn't available on this page. Please paste the transcript manually.", "error");
                return;
            }

            if (response.title && !els.meetingTitle.value.trim()) {
                els.meetingTitle.value = response.title;
            }

            if (response.text && response.text.trim()) {
                els.transcriptText.value = response.text.trim();
                showBanner("Captured text from the page. Review before sending.", "success");
            } else {
                showBanner("No transcript/caption text was found on this page. Please paste it manually.", "error");
            }
        });
    } catch (err) {
        showBanner("Live capture isn't supported on this page. Please paste the transcript manually.", "error");
    }
}

async function handleSend() {
    const user = await getStoredUser();
    if (!user) {
        showBanner("Please log in first.", "error");
        return;
    }

    const title = els.meetingTitle.value.trim();
    const text = els.transcriptText.value.trim();
    const audioFile = els.audioFile.files[0];

    if (!title) {
        showBanner("Enter a meeting title.", "error");
        return;
    }
    if (!text && !audioFile) {
        showBanner("Capture/paste a transcript, or choose an audio file.", "error");
        return;
    }
    if (audioFile && audioFile.size > 25 * 1024 * 1024) {
        showBanner("Audio file exceeds the 25MB limit.", "error");
        return;
    }

    els.sendBtn.disabled = true;
    els.sendBtn.textContent = "Sending...";

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const meetingUrl = tab && tab.url ? tab.url : "";
        const meetingDate = new Date().toISOString().split("T")[0];

        const formData = new FormData();
        formData.append("user_id", user.id);
        formData.append("title", title);
        formData.append("meeting_date", meetingDate);

        if (audioFile) {
            formData.append("audio", audioFile);
            showBanner("Uploading and transcribing audio...", "success");
        } else {
            formData.append("text", text);
        }
        // Fold the source page URL into participants/notes context since the
        // backend doesn't have a dedicated "source URL" column — keeps the
        // metadata visible without needing a schema change.
        if (meetingUrl) formData.append("participants", `(captured from: ${meetingUrl})`);

        // This single call both creates the transcript AND auto-creates a
        // linked Meeting entry on the backend (see routes/summarization.py) —
        // no separate "create meeting" step needed here.
        const createRes = await fetch(`${API_URL}/summarization/transcripts`, {
            method: "POST",
            body: formData,
        });
        const createBody = await createRes.json();
        if (!createRes.ok) throw new Error(createBody.detail || "Failed to upload transcript.");

        showBanner("Transcript sent! Opening the summary page...", "success");
        els.meetingTitle.value = "";
        els.transcriptText.value = "";
        els.audioFile.value = "";

        // Auto-navigate to the Meeting Summarization page with the transcript
        // already loaded — the user just needs to click "Summarize" there.
        chrome.tabs.create({
            url: `${API_URL}/meeting-summarization.html?transcript_id=${createBody.id}`,
        });

    } catch (err) {
        showBanner(err.message || "Something went wrong sending the transcript.", "error");
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = "🚀 Send to Meeting Avoider AI";
    }
}

function openWebApp() {
    chrome.tabs.create({ url: `${API_URL}/dashboard.html` });
}

document.addEventListener("DOMContentLoaded", () => {
    refreshView();
    els.loginBtn.addEventListener("click", handleLogin);
    els.logoutBtn.addEventListener("click", handleLogout);
    els.captureBtn.addEventListener("click", handleCapture);
    els.sendBtn.addEventListener("click", handleSend);
    els.openAppBtn.addEventListener("click", openWebApp);
});
