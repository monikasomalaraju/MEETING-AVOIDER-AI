window.API_URL = "http://127.0.0.1:8000"; // ✅ FIXED (important)

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
        const response = await fetch(`${window.API_URL}/meetings/${user.id}`);

        if (!response.ok) {
            console.error("Failed to fetch meetings");
            return;
        }

        meetings = await response.json();

    } catch (error) {
        console.error("Error loading meetings:", error);
    }
}

function goBack() {
    window.location.href = "dashboard.html";
}

function getMeetingStatus(meeting) {
    if (meeting.date === today) return { label: "Ongoing", css: "ongoing" };
    if (meeting.date > today) return { label: "Upcoming", css: "upcoming" };
    return { label: "Past", css: "past" };
}

function renderMeetings(type) {
    if (!list) return;
    list.innerHTML = "";

    const filtered = meetings.filter((meeting) => {
        if (type === "present") return meeting.date === today;
        if (type === "past") return meeting.date < today;
        if (type === "future") return meeting.date > today;
        return true;
    });

    const emptyState = document.querySelector(".empty-state");

    if (filtered.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    filtered.forEach((meeting) => {
        const status = getMeetingStatus(meeting);
        const div = document.createElement("div");
        div.className = "meeting-card";

        div.innerHTML = `
           <div class="meeting-status ${status.css}">
              ${status.label}
            </div>

            <h3>${escapeHtml(meeting.title)}</h3>

            <div class="meeting-info">

              <p>📅 ${escapeHtml(meeting.date)}</p>

              <p>⏰ ${escapeHtml(meeting.time)}</p>

              <p>👥 ${meeting.participants ? escapeHtml(meeting.participants) : "No participants added"}</p>

            </div>

            <div class="meeting-actions">

             <button class="btn-join" data-action="join">
                Join
             </button>

             <button class="btn-edit" data-action="edit">
               Edit
             </button>

             <button class="btn-delete" data-action="delete">
               Delete
             </button>

             </div>
       `;

        div.querySelector('[data-action="join"]').addEventListener("click", () => {
            if (meeting.link) {
                window.open(meeting.link, "_blank");
            } else {
                alert("No meeting link was added for this meeting.");
            }
        });

        div.querySelector('[data-action="edit"]').addEventListener("click", () => {
            window.location.href = `edit-meeting.html?id=${meeting.id}`;
        });

        div.querySelector('[data-action="delete"]').addEventListener("click", () => {
            deleteMeeting(meeting.id);
        });

        list.appendChild(div);
    });
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}


// ✅ DELETE MEETING (NEW)
async function deleteMeeting(meetingId) {
    const user = JSON.parse(localStorage.getItem("currentUser"));

    if (!user) return;

    if (!confirm("Are you sure you want to delete this meeting?")) return;

    try {
        const response = await fetch(
            `${window.API_URL}/meetings/${meetingId}?user_id=${user.id}`,
            { method: "DELETE" }
        );

        if (response.ok) {
            await loadMeetings();   // 🔄 reload
            renderMeetings(document.body.dataset.meetingType);
        } else {
            alert("Failed to delete meeting");
        }

    } catch (error) {
        console.error("Delete error:", error);
    }
}


// ✅ AUTO REFRESH AFTER ADD (IMPORTANT)
window.addEventListener("focus", async () => {
    await loadMeetings();
    renderMeetings(document.body.dataset.meetingType);
});


document.addEventListener("DOMContentLoaded", async () => {
    await loadMeetings();
    renderMeetings(document.body.dataset.meetingType);
});
