const calendar = document.getElementById("calendar");
const monthYear = document.getElementById("monthYear");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");

const todayList = document.getElementById("today");
const upcomingList = document.getElementById("upcoming");
const pastList = document.getElementById("past");

let currentDate = new Date();
let meetings = JSON.parse(localStorage.getItem("meetings")) || [];

/* Render Calendar */
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

    // Empty spaces before first day
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement("div");
        calendar.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayDiv = document.createElement("div");
        dayDiv.className = "day";
        dayDiv.innerText = day;

        // Today highlight
        const today = new Date();
        if (
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear()
        ) {
            dayDiv.classList.add("today");
        }

        // Meeting highlight
        if (meetings.some(m => m.date === dateStr)) {
            dayDiv.classList.add("has-meeting");
        }

        dayDiv.onclick = () => {
            window.location.href = `add-meeting.html?date=${dateStr}`;        
            if (name) {
              meetings.push({ date: dateStr, name });
              localStorage.setItem("meetings", JSON.stringify(meetings));
              renderCalendar();
              updateMeetings();
            }
        };

        calendar.appendChild(dayDiv);
    }
}

/* Update meeting lists */
function updateMeetings() {
    todayList.innerHTML = "";
    upcomingList.innerHTML = "";
    pastList.innerHTML = "";

    const today = new Date().toISOString().split("T")[0];

    meetings.forEach(m => {
        const div = document.createElement("div");
        div.className = "meeting-item";

        div.innerHTML = `
            <h4>${m.title}</h4>
            <p>🕒 Time: ${m.time}</p>
            <p>📅 Date: ${m.date}</p>
            <p>🔗 <a href="${m.link}" target="_blank">Join Meeting</a></p>
        `;

        if (m.date === today) {
            todayList.appendChild(div);
        } 
        else if (m.date > today) {
            upcomingList.appendChild(div);
        } 
        else {
            pastList.appendChild(div);
        }
    });
}


/* Month navigation */
prevBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
};

nextBtn.onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
};

/* Initial load */
renderCalendar();
updateMeetings();
