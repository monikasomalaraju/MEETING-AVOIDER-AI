const API_URL = "http://localhost:8000";

// Get date from URL
const params = new URLSearchParams(window.location.search);
const meetingDate = params.get("date");

// Show date on UI
document.getElementById("meetingDate").innerText = meetingDate || "Not selected";

// Save meeting
async function saveMeeting() {
    const title = document.getElementById("title").value.trim();
    const time = document.getElementById("time").value;
    const link = document.getElementById("link").value.trim();

    if (!title || !time || !link) {
        alert("Please fill all fields");
        return;
    }

    const user = JSON.parse(localStorage.getItem("currentUser"));
    if (!user) {
        alert("Please login first");
        window.location.href = "login.html";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/meetings/?user_id=${user.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: title,
                time: time,
                link: link,
                date: meetingDate
            })
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || "Failed to save meeting");
            return;
        }

        alert("Meeting added successfully!");
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Error: " + error.message);
    }
}
