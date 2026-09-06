window.API_URL = "http://127.0.0.1:8000";

let editingMeetingId = null;

const calendar =
document.getElementById("calendar");

const monthYear =
document.getElementById("monthYear");




let currentDate = new Date();

let meetings = [];
let selectedDate = null;

loadMeetings();


async function loadMeetings(){

    const user =
        JSON.parse(
            localStorage.getItem("currentUser")
        );

    const response =
        await fetch(
            `${window.API_URL}/meetings/${user.id}`
        );

    meetings =
        response.ok
        ? await response.json()
        : [];
    if(meetings.length){

    const latestMeeting =
        meetings[meetings.length - 1];

    currentDate =
        new Date(latestMeeting.date);
}

    renderCalendar();
}

function renderCalendar(){

    calendar.innerHTML="";

    const year =
        currentDate.getFullYear();

    const month =
        currentDate.getMonth();

    monthYear.innerText =
        currentDate.toLocaleString(
            "default",
            {
                month:"long",
                year:"numeric"
            }
        );

    const firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();

    const daysInMonth =
        new Date(
            year,
            month+1,
            0
        ).getDate();

    for(let i=0;i<firstDay;i++){

        calendar.appendChild(
            document.createElement("div")
        );

    }

    for(let day=1;day<=daysInMonth;day++){

        const dateStr =
            `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

        const div =
            document.createElement("div");

        div.className="day";

        div.innerHTML=day;

        const dayMeetings =
            meetings.filter(
                m=>m.date===dateStr
            );

        if(dayMeetings.length){

            div.classList.add(
                "has-meeting"
            );

            div.innerHTML +=
                `<div class="meeting-count">
                ${dayMeetings.length} Meeting
                </div>
                `;
        }
        if(selectedDate === dateStr){
    div.classList.add("selected-day");
}

       div.onclick = () => {

          selectedDate = dateStr;

          renderCalendar();

          showMeetings(
             dateStr,
             dayMeetings
            );
        };

        calendar.appendChild(div);
    }
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showMeetings(date, dayMeetings){

    const panel =
        document.getElementById("selectedDayMeetings");

    if(dayMeetings.length === 0){

        panel.innerHTML = `
            <h3>Meetings on ${date}</h3>
            <p>No meetings found</p>
        `;

        return;
    }

    panel.innerHTML = `
        <h3 style="margin-bottom:15px;">
            Meetings on ${date}
        </h3>
    `;
    

    dayMeetings.forEach(meeting => {
        const meetingDate = new Date(meeting.date);
        const today = new Date();

        today.setHours(0,0,0,0);
        meetingDate.setHours(0,0,0,0);
        
        let status = "Upcoming";
        let badgeClass = "badge-upcoming";
        
        if(meetingDate.getTime() === today.getTime()){
            status = "Today";
            badgeClass = "badge-today";
        }
        
        else if(meetingDate < today){
            
            status = "Completed";
            badgeClass = "badge-completed";
        }


        panel.innerHTML += `
            <div class="meeting-detail-card">

                <div class="meeting-badge ${badgeClass}">
                    ${status}
                </div>

                <h3 class="meeting-title">
                    ${escapeHtml(meeting.title)}
                </h3>
                <div class="meeting-meta">
                 
                   <span>📅 ${meeting.date}</span>
                   <span>🕒 ${meeting.time}</span>

                </div>

                <div class="meeting-link">
                  🔗 ${escapeHtml(meeting.link)}
                </div>
                
                <div class="meeting-actions">

                   ${new Date(`${meeting.date} ${meeting.time}`) < new Date()

                   ? `

                    <a
                        href="summary.html?id=${meeting.id}"
                        class="summary-btn">

                        View Summary

                    </a>

                    `

                   : `

                   <a
                     href="${escapeHtml(meeting.link)}"
                     target="_blank"
                     class="join-btn">

                     Join Meeting
                    </a>

                    `
                    }

                    <button
                      class="edit-btn"
                      onclick="editMeeting(${meeting.id})">

                      Edit
                    </button>

                    <button
                      class="delete-btn"
                      onclick="deleteMeeting(${meeting.id})">

                      Delete

                    </button>

                </div>

            </div>
        `;
        
    });
}


function goToToday(){

    currentDate = new Date();

    renderCalendar();

    const today = new Date();

const upcoming = meetings.filter(
    meeting => new Date(meeting.date) >= today
);

const completed = meetings.filter(
    meeting => new Date(meeting.date) < today
);
    const todayString = 
    new Date().toISOString().split("T")[0];

    const todayMeetings =
        meetings.filter(
            meeting => meeting.date === today
        );

    showMeetings(today, todayMeetings);
}




document.getElementById("prevMonth").addEventListener("click", () => {

    

    currentDate.setMonth(
        currentDate.getMonth() - 1
    );

    renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {

    

    currentDate.setMonth(
        currentDate.getMonth() + 1
    );

    renderCalendar();
});

async function deleteMeeting(meetingId){

    const user =
        JSON.parse(
            localStorage.getItem("currentUser")
        );

    if(!confirm("Delete this meeting?")){
        return;
    }

    try{

        const response = await fetch(
            `${window.API_URL}/meetings/${meetingId}?user_id=${user.id}`,
            {
                method:"DELETE"
            }
        );

        if(!response.ok){
            alert("Failed to delete");
            return;
        }

        alert("Meeting deleted");

        loadMeetings();

    }catch(error){

        alert(error.message);

    }
}

function editMeeting(meetingId){

    const meeting =
    meetings.find(
        m => m.id === meetingId
    );

    if(!meeting) return;

    document.getElementById("meetingTitle").value =
    meeting.title;

    document.getElementById("meetingDate").value =
    meeting.date;

    const [time, period] =
    meeting.time.split(" ");

    const [hour, minute] =
    time.split(":");

    document.getElementById("meetingHour").value =
    hour;

    document.getElementById("meetingMinute").value =
    minute;

    document.getElementById("meetingPeriod").value =
    period;

    document.getElementById("meetingLink").value =
    meeting.link;

    document.getElementById("modalTitle").innerText =
    "Edit Meeting";

    document.getElementById("meetingModal").style.display =
    "flex";

    editingMeetingId = meeting.id;

document.getElementById("saveMeetingBtn").innerText =
    "Update Meeting";
}


function closeModal(){

    document.getElementById(
        "meetingModal"
    ).style.display = "none";
}

document.getElementById("saveMeetingBtn")
.addEventListener("click", saveMeeting);

async function saveMeeting(){


    const user =
        JSON.parse(
            localStorage.getItem("currentUser")
        );

    const title =
        document.getElementById("meetingTitle").value;

    const date =
        document.getElementById("meetingDate").value;

    const hour =
        document.getElementById("meetingHour").value;

    const minute =
        document.getElementById("meetingMinute").value;

    const period =
        document.getElementById("meetingPeriod").value;

    const link =
        document.getElementById("meetingLink").value;

    const time =
        `${hour}:${minute} ${period}`;

    const meetingData = {
        user_id: user.id,
        title: title,
        date: date,
        time: time,
        link: link,
        text: ""
    };

    try{

        if(editingMeetingId){

            const response = await fetch(
                `${window.API_URL}/meetings/${editingMeetingId}`,
                {
                    method: "PUT",
                    headers:{
                        "Content-Type":"application/json"
                    },
                    body: JSON.stringify(meetingData)
                }
            );

            if(!response.ok){
                alert("Failed to update meeting");
                return;
            }

            alert("Meeting updated successfully");

            closeModal();

            editingMeetingId = null;

            await loadMeetings();


            if(selectedDate){
                
                const selectedMeetings =
                meetings.filter(
                    m => m.date === selectedDate
                );
                
                showMeetings(
                    selectedDate,
                    selectedMeetings
                );
            }
            return;
        }


    }catch(error){

        console.error("SAVE ERROR:", error);

         alert(error.message);
    }
}

window.openAddMeeting = function () {
    window.location.href = "add-meeting.html";
};