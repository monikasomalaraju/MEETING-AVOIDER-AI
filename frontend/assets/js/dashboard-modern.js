window.API_URL = window.API_URL || "http://127.0.0.1:8000";

let currentUser = null;

document.addEventListener("DOMContentLoaded", initDashboard);

function diShowToast(message, type) {
    const toast = document.getElementById("di-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `ms-toast show ${type}`;
    setTimeout(() => toast.classList.remove("show"), 5000);
}

function diTimeOfDayGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

async function initDashboard() {
    const userStr = localStorage.getItem("currentUser");
    if (!userStr) {
        window.location.href = "login.html";
        return;
    }
    currentUser = JSON.parse(userStr);

    document.getElementById("diDateLine").textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    try {
        const res = await fetch(`${window.API_URL}/users/${currentUser.id}/dashboard`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Could not load your dashboard.");

        diRenderAll(data);

    } catch (err) {
        diShowToast(err.message || "Could not load your dashboard.", "error");
        // Fall back to zeros rather than leaving skeleton shimmer forever
        diRenderAll({
            name: currentUser.name, kpis: {}, todays_meetings: [], insights: {},
            action_items: [], recent_summaries: [], activity_timeline: [],
        });
    }
}

function diRenderAll(data) {
    document.getElementById("diGreeting").textContent = `${diTimeOfDayGreeting()}, ${data.name || currentUser.name || "there"} 👋`;

    const total = data.kpis?.total_meetings || 0;
    const upcoming = data.kpis?.upcoming_meetings || 0;
    const todayCount = (data.todays_meetings || []).length;
    let status;
    if (todayCount > 0) {
        status = `You have ${todayCount} meeting${todayCount > 1 ? "s" : ""} today.`;
    } else if (upcoming > 0) {
        status = `Nothing today — ${upcoming} meeting${upcoming > 1 ? "s" : ""} coming up.`;
    } else if (total === 0) {
        status = "No meetings yet — schedule one or summarize a transcript to get started.";
    } else {
        status = "All caught up — nothing scheduled right now.";
    }
    document.getElementById("diStatusLine").innerHTML = `<i class="fa-solid fa-circle-info"></i> ${status}`;

    diRenderKpis(data.kpis || {});
    diRenderTodayMeetings(data.todays_meetings || []);
    diRenderActionItems(data.action_items || []);
    diRenderTimeline(data.activity_timeline || []);
    diRenderInsights(data.insights || {});
    diRenderRecentSummaries(data.recent_summaries || []);
}

function diRenderKpis(kpis) {
    const map = {
        kpiTotal: kpis.total_meetings,
        kpiUpcoming: kpis.upcoming_meetings,
        kpiCompleted: kpis.completed_meetings,
        kpiSummaries: kpis.summaries_generated,
        kpiActionItems: kpis.action_items_count,
        kpiDecisions: kpis.decisions_extracted,
    };
    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        el.classList.remove("di-skeleton-num");
        el.textContent = (value ?? 0);
    });
}

function diFormatRelativeTime(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function diRenderTodayMeetings(meetings) {
    const el = document.getElementById("diTodayMeetings");
    if (meetings.length === 0) {
        el.innerHTML = `<p class="di-empty-msg">No meetings scheduled today.</p>`;
        return;
    }
    el.innerHTML = "";
    meetings.forEach(m => {
        const div = document.createElement("div");
        div.className = "di-item";
        div.innerHTML = `
            <div class="di-item-main">
                <h4>${diEscape(m.title)}</h4>
                <p>🕒 ${diEscape(m.time)} ${m.participants ? "• 👥 " + diEscape(m.participants) : ""}</p>
            </div>
            <span class="di-item-badge">${diEscape(m.status)}</span>
            <i class="fa-solid fa-chevron-right di-item-arrow"></i>
        `;
        div.addEventListener("click", () => {
            window.location.href = m.transcript_id
                ? `meeting-summarization.html?transcript_id=${m.transcript_id}`
                : `edit-meeting.html?id=${m.id}`;
        });
        el.appendChild(div);
    });
}

function diRenderActionItems(items) {
    const el = document.getElementById("diActionItems");
    if (items.length === 0) {
        el.innerHTML = `<p class="di-empty-msg">No action items identified yet — summarize a meeting to generate some.</p>`;
        return;
    }
    el.innerHTML = "";
    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "di-item";
        div.innerHTML = `
            <div class="di-item-main">
                <h4>${diEscape(item.text)}</h4>
                <p>From: ${diEscape(item.meeting_title)}</p>
            </div>
            <i class="fa-solid fa-chevron-right di-item-arrow"></i>
        `;
        div.addEventListener("click", () => {
            window.location.href = `meeting-summarization.html?transcript_id=${item.transcript_id}`;
        });
        el.appendChild(div);
    });
}

const DI_EVENT_ICONS = {
    "Meeting Created": "fa-calendar-plus",
    "Meeting Updated": "fa-pen",
    "Transcript Imported": "fa-file-import",
    "Summary Generated": "fa-wand-magic-sparkles",
    "Profile Updated": "fa-user-pen",
};

function diRenderTimeline(events) {
    const el = document.getElementById("diTimeline");
    if (events.length === 0) {
        el.innerHTML = `<p class="di-empty-msg">No activity yet.</p>`;
        return;
    }
    el.innerHTML = "";
    events.forEach(ev => {
        const div = document.createElement("div");
        div.className = "di-timeline-item";
        const icon = DI_EVENT_ICONS[ev.type] || "fa-circle";
        div.innerHTML = `
            <div class="di-timeline-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="di-timeline-content">
                <p>${diEscape(ev.description)}</p>
                <span>${diFormatRelativeTime(ev.timestamp)}</span>
            </div>
        `;
        el.appendChild(div);
    });
}

function diRenderInsights(insights) {
    const el = document.getElementById("diInsights");
    const cards = [];

    if (insights.most_discussed_topic) {
        cards.push({ icon: "fa-fire", label: "Most Discussed Topic", value: insights.most_discussed_topic });
    }
    if (insights.most_frequent_category) {
        cards.push({ icon: "fa-layer-group", label: "Most Frequent Category", value: insights.most_frequent_category });
    }
    if (insights.avg_duration_minutes) {
        cards.push({ icon: "fa-stopwatch", label: "Average Meeting Duration", value: `${insights.avg_duration_minutes} min` });
    }
    if (insights.total_decisions) {
        cards.push({ icon: "fa-gavel", label: "Total Decisions", value: insights.total_decisions });
    }
    if (insights.total_action_items) {
        cards.push({ icon: "fa-square-check", label: "Total Action Items", value: insights.total_action_items });
    }

    if (cards.length === 0) {
        el.innerHTML = `<p class="di-empty-msg">Generate a few AI summaries and insights will show up here automatically.</p>`;
        return;
    }

    el.innerHTML = "";
    cards.forEach(c => {
        const div = document.createElement("div");
        div.className = "di-insight-card";
        div.innerHTML = `
            <i class="fa-solid ${c.icon}"></i>
            <strong>${diEscape(String(c.value))}</strong>
            <span>${diEscape(c.label)}</span>
        `;
        el.appendChild(div);
    });
}

function diRenderRecentSummaries(summaries) {
    const el = document.getElementById("diRecentSummaries");
    if (summaries.length === 0) {
        el.innerHTML = `<p class="di-empty-msg">No AI summaries generated yet.</p>`;
        return;
    }
    el.innerHTML = "";
    summaries.forEach(s => {
        const div = document.createElement("div");
        div.className = "di-item";
        div.innerHTML = `
            <div class="di-item-main">
                <h4>${diEscape(s.title)}</h4>
                <p>${s.meeting_date ? diEscape(s.meeting_date) + " — " : ""}${diEscape(s.preview)}</p>
            </div>
            <i class="fa-solid fa-chevron-right di-item-arrow"></i>
        `;
        div.addEventListener("click", () => {
            window.location.href = `meeting-summarization.html?transcript_id=${s.transcript_id}`;
        });
        el.appendChild(div);
    });
}

function diEscape(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}
