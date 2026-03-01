const API_URL = "http://localhost:8000";
const calendar = document.getElementById("calendar");
const monthYear = document.getElementById("monthYear");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");

const todayList = document.getElementById("today");
const upcomingList = document.getElementById("upcoming");
const pastList = document.getElementById("past");

let currentDate = new Date();
let meetings = [];
let currentUser = null;

// Initialize app
async function initApp() {
    const userStr = localStorage.getItem("currentUser");
    if (!userStr) {
        window.location.href = "login.html";
        return;
    }
    
    currentUser = JSON.parse(userStr);
    await loadMeetings();
    renderCalendar();
    updateMeetings();
}

// Load meetings from API
async function loadMeetings() {
    try {
        const response = await fetch(`${API_URL}/meetings/${currentUser.id}`);
        if (response.ok) {
            meetings = await response.json();
        }
    } catch (error) {
        console.error("Error loading meetings:", error);
        meetings = [];
    }
}

// ask permission once
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

function renderCalendar() {
    calendar.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.innerText = currentDate.toLocaleString("default", {
        month: "long",
        year: "numeric"
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        calendar.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const div = document.createElement("div");
        div.className = "day";
        div.innerText = day;

        const today = new Date().toISOString().split("T")[0];
        if (dateStr === today) div.classList.add("today");
        if (meetings.some(m => m.date === dateStr)) div.classList.add("has-meeting");

        div.addEventListener("click", () => {
            window.location.href = `add-meeting.html?date=${dateStr}`;
        });

        calendar.appendChild(div);
    }
}


function updateMeetings() {
    todayList.innerHTML = "";
    upcomingList.innerHTML = "";
    pastList.innerHTML = "";

    const today = new Date().toISOString().split("T")[0];
    let todayCount = 0;

    meetings.forEach(m => {
        const div = document.createElement("div");
        div.className = "meeting-item";
        div.innerHTML = `
            <h4>${m.title}</h4>
            <p>📅 ${m.date}</p>
            <p>🕒 ${m.time}</p>
            <a href="${m.link}" target="_blank">Join</a>
        `;

        if (m.date === today) {
            todayList.appendChild(div);
            todayCount++;
        } else if (m.date > today) {
            upcomingList.appendChild(div);
        } else {
            pastList.appendChild(div);
        }
    });

    const badge = document.getElementById("todayBadge");
    const notify = document.getElementById("todayNotification");

    if (todayCount > 0) {
        badge.style.display = "inline-block";
        notify.style.display = "block";
    } else {
        badge.style.display = "none";
        notify.style.display = "none";
    }
}


prevBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
};

nextBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
};

// calls moved to DOMContentLoaded after initApp
function startMeetingReminders() {
    const today = new Date().toISOString().split("T")[0];

    meetings.forEach(m => {
        if (m.date !== today) return;

        const [hours, minutes] = m.time.split(":");
        const meetingTime = new Date();
        meetingTime.setHours(hours, minutes, 0, 0);

        // 🔔 Reminder 10 minutes before
        const reminderTime = new Date(meetingTime.getTime() - 10 * 60000);

        const now = new Date();

        if (reminderTime > now) {
            const delay = reminderTime - now;

            setTimeout(() => {
                new Notification("📅 Bye Meet Reminder", {
                    body: `Meeting "${m.title}" starts in 10 minutes`,
                });
            }, delay);
        }
    });
}
startMeetingReminders();

function closePopup() {
    document.getElementById("joinPopup").style.display = "none";
}

function checkMeetingStart() {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    meetings.forEach(m => {
        if (m.date !== today) return;

        const popupKey = "popupShown_" + m.date + "_" + m.time;
        if (localStorage.getItem(popupKey)) return;

        const [h, min] = m.time.split(":");
        const meetingTime = new Date();
        meetingTime.setHours(h, min, 0, 0);

        // Allow popup within first 1 minute
        if (now >= meetingTime && now - meetingTime < 60000) {
            document.getElementById("popupTitle").innerText = m.title;
            document.getElementById("joinBtn").onclick = () => {
                window.open(m.link, "_blank");
            };

            document.getElementById("joinPopup").style.display = "block";
            localStorage.setItem(popupKey, "true");
        }
    });
}

// 🔁 check every 30 seconds
setInterval(checkMeetingStart, 30000);

// Load user profile and nav
document.addEventListener("DOMContentLoaded", async () => {
    // Load user name and profile image
    if (currentUser) {
        document.getElementById("profileName").innerText = currentUser.name || "User";
    }

    const savedImage = localStorage.getItem("profileImage");
    const topProfile = document.querySelector(".top-profile");
    if (savedImage && topProfile) {
        topProfile.src = savedImage;
    }

    // Highlight current nav link
    const navItems = document.querySelectorAll(".nav-item");
    const currentPage = window.location.pathname.split("/").pop();
    navItems.forEach(item => {
        const linkPage = item.getAttribute("href");
        if (linkPage === currentPage) {
            item.classList.add("active");
        }
    });

    // Initialize app
    await initApp();
});

function checkMeetingReminder() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentTime = now.toTimeString().slice(0,5); // HH:MM

    meetings.forEach(m => {
        if (m.date === today && m.time === currentTime && !m.notified) {
            showMeetingPopup(m);
            m.notified = true;
            localStorage.setItem("meetings", JSON.stringify(meetings));
        }
    });
}

function showMeetingPopup(meeting) {
    document.getElementById("popupTitle").innerText = meeting.title;
    document.getElementById("popupTime").innerText =
        `🕒 ${meeting.time} | 📅 Today`;

    document.getElementById("joinMeetingBtn").onclick = () => {
        window.open(meeting.link, "_blank");
        closeMeetingPopup();
    };

    document.getElementById("meetingPopup").style.display = "flex";
}

function closeMeetingPopup() {
    document.getElementById("meetingPopup").style.display = "none";
}

/* Check every minute */
setInterval(checkMeetingReminder, 60000);

function openProfilePopup() {
    document.getElementById("profileOverlay").style.display = "block";
}

function closeProfilePopup() {
    document.getElementById("profileOverlay").style.display = "none";
}

function logout() {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("profileImage");
    window.location.href = "login.html";
}

function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (file) {
        // Save file name temporarily
        localStorage.setItem("uploadedFileName", file.name);

        // Navigate to processing page
        window.location.href = "processing.html";
    }
}
