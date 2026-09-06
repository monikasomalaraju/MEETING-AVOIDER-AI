window.API_URL = "http://127.0.0.1:8000"; // ✅ FIXED

const params = new URLSearchParams(window.location.search);
const selectedDate = params.get("date");

if(selectedDate){
    document.getElementById("meetingDate").value = selectedDate;
}
async function saveMeeting() {
    const date = document.getElementById("meetingDate").value;
    const title = document.getElementById("title").value.trim();
    const hour = document.getElementById("hour").value;
    const minute = document.getElementById("minute").value;
    const ampm = document.getElementById("ampm").value;
    const time = `${hour}:${minute} ${ampm}`;
    const link = document.getElementById("link").value.trim();
    const participants = document.getElementById("participants").value.trim();


    if (!title || !date || !time || !link) {
        alert("Please fill all fields");
        return;
    }

    const user = JSON.parse(localStorage.getItem("currentUser"));

    if (!user) {
        alert("Please login first");
        window.location.href = "login.html";
        return;
    }

    const saveBtn = document.getElementById("saveMeetingBtn");
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
    }

    try {
        const response = await fetch(`${window.API_URL}/meetings/`, {  // ✅ FIXED URL
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: user.id,        // ✅ FIXED (must be inside body)
                title: title,
                date: date,
                time: time,
                link: link,
                participants: participants,
                text: ""                 // ✅ REQUIRED field
            })
        });

        const result = await response.text();

        if (!response.ok) {
            alert("Backend Error:\n" + result);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Meeting";
            }
            return;
        }

        alert("Meeting added successfully!");

        // ✅ redirect back
        window.location.href = "calendar.html";
       

    } catch (error) {
        alert("Error: " + error.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Meeting";
        }
    }
}

 window.saveMeeting = saveMeeting;
