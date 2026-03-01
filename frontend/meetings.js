const API_URL = "http://localhost:8000";
let meetings = [];
const list = document.getElementById("meetingList");
const today = new Date().toISOString().split("T")[0];

async function loadMeetings() {
    const user = JSON.parse(localStorage.getItem("currentUser"));
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/meetings/${user.id}`);
        if (response.ok) {
            meetings = await response.json();
        }
    } catch (error) {
        console.error("Error loading meetings:", error);
    }
}

function goBack() {
    window.location.href = "dashboard.html";
}

function renderMeetings(type) {
    list.innerHTML = "";

    const filtered = meetings.filter(m => {
        if (type === "present") return m.date === today;
        if (type === "past") return m.date < today;
        if (type === "future") return m.date > today;
    });

    if (filtered.length === 0) {
        list.innerHTML = "<p>No meetings found.</p>";
        return;
    }

    filtered.forEach(m => {
        const div = document.createElement("div");
        div.className = "meeting-card";
        div.innerHTML = `
            <h3>${m.title}</h3>
            <p>📅 ${m.date}</p>
            <p>🕒 ${m.time}</p>
            <a href="${m.link}" target="_blank">Join Meeting</a>
        `;
        list.appendChild(div);
    });
}

// Load meetings on page load
document.addEventListener("DOMContentLoaded", async () => {
    await loadMeetings();
    // renderMeetings is called in the page's inline script
});
