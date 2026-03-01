// Get date from URL
const params = new URLSearchParams(window.location.search);
const meetingDate = params.get("date");

// Show date on UI
document.getElementById("meetingDate").innerText = meetingDate || "Not selected";

// Save meeting
function saveMeeting() {
    const title = document.getElementById("title").value.trim();
    const time = document.getElementById("time").value;
    const link = document.getElementById("link").value.trim();

    if (!title || !time || !link) {
        alert("Please fill all fields");
        return;
    }

    let meetings = JSON.parse(localStorage.getItem("meetings")) || [];

    meetings.push({
        title: title,
        time: time,
        link: link,
        date: meetingDate
    });

    localStorage.setItem("meetings", JSON.stringify(meetings));

    alert("Meeting added successfully!");

    // Go back to dashboard
    window.location.href = "dashboard.html";
}
