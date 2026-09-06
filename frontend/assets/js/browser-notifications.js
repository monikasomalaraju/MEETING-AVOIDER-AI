/* Browser meeting reminders run while an authenticated app page is open. */
(function () {
    "use strict";

    const POLL_INTERVAL_MS = 30 * 1000;
    const NORMAL_LEAD_SECONDS = 10 * 60;
    const NORMAL_WINDOW_SECONDS = 2 * 60;
    const SENT_STORAGE_KEY = "meetingAvoiderBrowserRemindersSent";
    const PERMISSION_STORAGE_KEY = "meetingAvoiderBrowserPermissionRequested";
    const TEST_DELAY_STORAGE_KEY = "meetingAvoiderBrowserReminderTestSeconds";

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem("currentUser") || "null");
        } catch (error) {
            console.warn("Browser reminders: invalid currentUser data.", error);
            return null;
        }
    }

    function getApiUrl() {
        return window.API_URL || "http://127.0.0.1:8000";
    }

    function getTestDelaySeconds() {
        const value = Number(localStorage.getItem(TEST_DELAY_STORAGE_KEY));
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    function getReminderWindow() {
        const testDelay = getTestDelaySeconds();
        if (testDelay !== null) {
            return {
                leadSeconds: testDelay,
                windowSeconds: Math.max(10, Math.min(30, testDelay / 2)),
            };
        }
        return {
            leadSeconds: NORMAL_LEAD_SECONDS,
            windowSeconds: NORMAL_WINDOW_SECONDS,
        };
    }

    function parseMeetingDate(meeting) {
        if (!meeting || !meeting.date || !meeting.time) return null;

        const value = `${meeting.date} ${meeting.time}`;
        const twelveHourMatch = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (twelveHourMatch) {
            const [, date, hourText, minuteText, period] = twelveHourMatch;
            let hour = Number(hourText) % 12;
            if (period.toUpperCase() === "PM") hour += 12;
            const parsed = new Date(`${date}T${String(hour).padStart(2, "0")}:${minuteText}:00`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        const twentyFourHourMatch = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})$/);
        if (twentyFourHourMatch) {
            const [, date, hour, minute] = twentyFourHourMatch;
            const parsed = new Date(`${date}T${String(hour).padStart(2, "0")}:${minute}:00`);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        return null;
    }

    function getSentReminders() {
        try {
            const value = JSON.parse(localStorage.getItem(SENT_STORAGE_KEY) || "[]");
            return new Set(Array.isArray(value) ? value : []);
        } catch (error) {
            return new Set();
        }
    }

    function saveSentReminders(sentReminders) {
        localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(Array.from(sentReminders).slice(-200)));
    }

    async function requestPermissionOnce() {
        if (!("Notification" in window)) {
            console.info("Browser reminders unavailable: this browser does not support notifications.");
            return false;
        }

        if (Notification.permission === "granted") return true;
        if (Notification.permission === "denied") {
            console.info("Browser reminders disabled: notification permission is denied.");
            return false;
        }

        if (localStorage.getItem(PERMISSION_STORAGE_KEY) === "1") return false;

        localStorage.setItem(PERMISSION_STORAGE_KEY, "1");
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                console.info("Browser reminders disabled: notification permission was not granted.");
            }
            return permission === "granted";
        } catch (error) {
            console.warn("Browser reminders: permission request failed.", error);
            return false;
        }
    }

    function showMeetingNotification(meeting, meetingDate) {
        const notification = new Notification("Meeting Avoider AI", {
            body: `${meeting.title}\n${meeting.time}\nYour meeting starts in 10 minutes.`,
            tag: `meeting-reminder-${meeting.id}-${meeting.date}-${meeting.time}`,
            icon: "/assets/images/logo.png",
        });

        notification.onclick = () => {
            window.focus();
            if (meeting.link) window.open(meeting.link, "_blank", "noopener,noreferrer");
            notification.close();
        };

        return notification;
    }

    async function checkUpcomingMeetings() {
        const user = getCurrentUser();
        if (!user || !("Notification" in window) || Notification.permission !== "granted") return;

        try {
            const response = await fetch(`${getApiUrl()}/meetings/${user.id}`);
            if (!response.ok) return;
            const meetings = await response.json();
            const now = Date.now();
            const reminderWindow = getReminderWindow();
            const sentReminders = getSentReminders();
            let changed = false;

            meetings.forEach((meeting) => {
                const meetingDate = parseMeetingDate(meeting);
                if (!meetingDate) return;

                const secondsUntil = (meetingDate.getTime() - now) / 1000;
                const reminderKey = `${meeting.id}:${meeting.date}:${meeting.time}`;
                const lowerBound = reminderWindow.leadSeconds - reminderWindow.windowSeconds;
                const upperBound = reminderWindow.leadSeconds + reminderWindow.windowSeconds;

                if (secondsUntil >= lowerBound && secondsUntil <= upperBound && !sentReminders.has(reminderKey)) {
                    showMeetingNotification(meeting, meetingDate);
                    sentReminders.add(reminderKey);
                    changed = true;
                }
            });

            if (changed) saveSentReminders(sentReminders);
        } catch (error) {
            console.warn("Browser reminders: could not check meetings.", error);
        }
    }

    async function startBrowserReminders() {
        if (!getCurrentUser()) return;
        await requestPermissionOnce();
        await checkUpcomingMeetings();
        window.setInterval(checkUpcomingMeetings, POLL_INTERVAL_MS);
    }

    window.meetingAvoiderBrowserReminders = {
        start: startBrowserReminders,
        check: checkUpcomingMeetings,
        requestPermission: requestPermissionOnce,
    };

    startBrowserReminders();
})();
