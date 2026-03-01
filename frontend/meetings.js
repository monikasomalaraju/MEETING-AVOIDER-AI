const meetings = JSON.parse(localStorage.getItem("meetings")) || [];
const list = document.getElementById("meetingList");
const today = new Date().toISOString().split("T")[0];

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
