const API_URL = "http://127.0.0.1:8000";
const REMINDER_PREFIX = "ma-meeting-reminder-";
const SYNC_ALARM = "ma-meeting-sync";
const REMINDER_LEAD_MS = 10 * 60 * 1000;
const SYNC_PERIOD_MINUTES = 1;
const NOTIFIED_KEY = "maNotifiedMeetingReminders";
const NOTIFICATION_KEY = "maReminderNotifications";

function getStoredUser() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["maUser"], (result) => resolve(result.maUser || null));
    });
}

function getStoredValue(key, fallback) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => resolve(result[key] || fallback));
    });
}

function setStoredValue(key, value) {
    return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
}

function parseMeetingDate(meeting) {
    if (!meeting || !meeting.date || !meeting.time) return null;
    const twelveHour = `${meeting.date} ${meeting.time}`.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{1,2}):([0-9]{2})\s*(AM|PM)$/i);
    const twentyFourHour = `${meeting.date} ${meeting.time}`.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{1,2}):([0-9]{2})$/);
    let value;

    if (twelveHour) {
        let hour = Number(twelveHour[2]) % 12;
        if (twelveHour[4].toUpperCase() === "PM") hour += 12;
        value = `${twelveHour[1]}T${String(hour).padStart(2, "0")}:${twelveHour[3]}:00`;
    } else if (twentyFourHour) {
        value = `${twentyFourHour[1]}T${String(twentyFourHour[2]).padStart(2, "0")}:${twentyFourHour[3]}:00`;
    } else {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function reminderKey(meeting) {
    return `${meeting.id}:${meeting.date}:${meeting.time}`;
}

function alarmName(meeting) {
    return `${REMINDER_PREFIX}${meeting.id}`;
}

async function clearReminderAlarms() {
    const alarms = await chrome.alarms.getAll();
    await Promise.all(alarms
        .filter((alarm) => alarm.name.startsWith(REMINDER_PREFIX))
        .map((alarm) => chrome.alarms.clear(alarm.name)));
}

async function syncMeetingReminders() {
    const user = await getStoredUser();
    if (!user || !user.id) {
        await clearReminderAlarms();
        return;
    }

    let response;
    try {
        response = await fetch(`${API_URL}/meetings/${user.id}`);
    } catch (error) {
        console.warn("Meeting reminders: backend unavailable.", error);
        return;
    }
    if (!response.ok) return;

    const meetings = await response.json();
    await clearReminderAlarms();
    const now = Date.now();
    const notified = await getStoredValue(NOTIFIED_KEY, []);
    const notifiedSet = new Set(Array.isArray(notified) ? notified : []);

    for (const meeting of meetings) {
        const meetingDate = parseMeetingDate(meeting);
        if (!meetingDate || meetingDate.getTime() <= now) continue;

        const key = reminderKey(meeting);
        if (notifiedSet.has(key)) continue;

        const reminderAt = Math.max(now + 1000, meetingDate.getTime() - REMINDER_LEAD_MS);
        chrome.alarms.create(alarmName(meeting), { when: reminderAt });
    }

    await setStoredValue(NOTIFIED_KEY, Array.from(notifiedSet).slice(-500));
}

async function showMeetingReminder(meeting) {
    const key = reminderKey(meeting);
    const notified = await getStoredValue(NOTIFIED_KEY, []);
    const notifiedSet = new Set(Array.isArray(notified) ? notified : []);
    if (notifiedSet.has(key)) return;

    notifiedSet.add(key);
    await setStoredValue(NOTIFIED_KEY, Array.from(notifiedSet).slice(-500));
    const notificationId = `ma-notification-${meeting.id}-${Date.now()}`;
    const notificationData = await getStoredValue(NOTIFICATION_KEY, {});
    notificationData[notificationId] = { link: meeting.link || `${API_URL}/future-meetings.html` };
    await setStoredValue(NOTIFICATION_KEY, notificationData);

    chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Meeting Reminder",
        message: `${meeting.title || "Upcoming meeting"}\n${meeting.date} at ${meeting.time}`,
        priority: 2,
    });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === SYNC_ALARM) {
        await syncMeetingReminders();
        return;
    }
    if (!alarm.name.startsWith(REMINDER_PREFIX)) return;

    const meetingId = alarm.name.slice(REMINDER_PREFIX.length);
    const user = await getStoredUser();
    if (!user || !user.id) return;
    try {
        const response = await fetch(`${API_URL}/meetings/${user.id}`);
        if (!response.ok) return;
        const meeting = (await response.json()).find((item) => String(item.id) === meetingId);
        if (meeting && parseMeetingDate(meeting)?.getTime() > Date.now()) await showMeetingReminder(meeting);
    } catch (error) {
        console.warn("Meeting reminders: could not load alarm meeting.", error);
    }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
    const notificationData = await getStoredValue(NOTIFICATION_KEY, {});
    const data = notificationData[notificationId];
    if (data?.link) chrome.tabs.create({ url: data.link });
    delete notificationData[notificationId];
    await setStoredValue(NOTIFICATION_KEY, notificationData);
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MA_SYNC_REMINDERS") syncMeetingReminders();
});

chrome.runtime.onInstalled.addListener((details) => {
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
    syncMeetingReminders();
    if (details.reason === "install") {
        chrome.tabs.create({ url: `${API_URL}/login.html` });
    }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
    syncMeetingReminders();
});


