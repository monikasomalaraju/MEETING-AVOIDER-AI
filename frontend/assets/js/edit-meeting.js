window.API_URL = "http://127.0.0.1:8000";

const params =
new URLSearchParams(window.location.search);

const meetingId =
params.get("id");

function getAuthUser() {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!user) {
        alert("Please login first");
        window.location.href = "login.html";
        return null;
    }
    return user;
}

loadMeeting();

async function loadMeeting(){

    const user = getAuthUser();
    if (!user) return;

    const response =
    await fetch(
        `${window.API_URL}/meetings/${user.id}`
    );

    const meetings =
    await response.json();

    const meeting =
    meetings.find(
        m => m.id == meetingId
    );

    if(!meeting) return;

    document.getElementById("title").value =
    meeting.title;

    document.getElementById("date").value =
    meeting.date;

    document.getElementById("time").value =
    meeting.time;

    document.getElementById("link").value =
    meeting.link;

    document.getElementById("participants").value =
    meeting.participants || "";
}

async function updateMeeting(){

    const user = getAuthUser();
    if (!user) return;

    const btn = document.getElementById("updateMeetingBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
    }

    try {
        const response =
        await fetch(
            `${window.API_URL}/meetings/${meetingId}`,
            {
                method:"PUT",

                headers:{
                    "Content-Type":"application/json"
                },

                body:JSON.stringify({

                    user_id:user.id,

                    title:
                    document.getElementById("title").value,

                    date:
                    document.getElementById("date").value,

                    time:
                    document.getElementById("time").value,

                    link:
                    document.getElementById("link").value,

                    participants:
                    document.getElementById("participants").value,

                    text:""

                })
            }
        );

        if(!response.ok){

            alert("Update failed");
            return;

        }

        alert("Meeting updated");

        window.location.href =
        "calendar.html";

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Save Changes";
        }
    }
}
