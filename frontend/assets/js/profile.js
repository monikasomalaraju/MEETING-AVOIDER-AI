window.API_URL = window.API_URL || "http://127.0.0.1:8000";

let pfUser = null;

function pfShowToast(message, type) {
    const toast = document.getElementById("pf-toast");
    toast.textContent = message;
    toast.className = `ms-toast show ${type}`;
    setTimeout(() => toast.classList.remove("show"), 5000);
}

function pfFormatDate(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function pfGetUser() {
    const user = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (!user) {
        window.location.href = "login.html";
        return null;
    }
    return user;
}

async function pfLoadProfile() {
    const authUser = pfGetUser();
    if (!authUser) return;

    try {
        const res = await fetch(`${window.API_URL}/users/${authUser.id}/profile`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Could not load your profile.");

        pfUser = body;
        pfRenderProfile(body);
    } catch (err) {
        pfShowToast(err.message || "Could not load your profile.", "error");
    }

    pfLoadStats(authUser.id);
}

function pfRenderProfile(user) {
    document.getElementById("profileName").textContent = user.name || "User";
    document.getElementById("profileEmail").textContent = user.email || "No email available";
    document.getElementById("profileRoleLine").textContent =
        [user.role, user.organization].filter(Boolean).join(" • ") || "No role set yet";
    document.getElementById("profileJoined").textContent = pfFormatDate(user.created_at);
    document.getElementById("profileLastLogin").textContent = user.last_login ? pfFormatDate(user.last_login) : "This is your first login";

    document.getElementById("pfName").value = user.name || "";
    document.getElementById("pfEmail").value = user.email || "";
    document.getElementById("pfPhone").value = user.phone || "";
    document.getElementById("pfRole").value = user.role || "";
    document.getElementById("pfOrganization").value = user.organization || "";
    document.getElementById("pfDepartment").value = user.department || "";
    document.getElementById("pfBio").value = user.bio || "";
    document.getElementById("pfNotifyToggle").checked = user.notify_email !== false;
}

async function pfLoadStats(userId) {
    try {
        const res = await fetch(`${window.API_URL}/users/${userId}/stats`);
        const stats = await res.json();
        if (!res.ok) throw new Error(stats.detail || "Could not load stats.");

        document.getElementById("statTotalMeetings").textContent = stats.total_meetings;
        document.getElementById("statUpcoming").textContent = stats.upcoming_meetings;
        document.getElementById("statPast").textContent = stats.past_meetings;
        document.getElementById("statSummaries").textContent = stats.summaries_generated;
        document.getElementById("statActionItems").textContent = stats.action_items_count;
    } catch (err) {
        console.error("Failed to load stats:", err);
    }
}

function pfSetEditing(editing) {
    ["pfName", "pfPhone", "pfRole", "pfOrganization", "pfDepartment", "pfBio"].forEach(id => {
        document.getElementById(id).disabled = !editing;
    });
    document.getElementById("pfSaveRow").style.display = editing ? "flex" : "none";
    document.getElementById("pfEditBtn").textContent = editing ? "Editing..." : "Edit";
    document.getElementById("pfEditBtn").disabled = editing;
}

async function pfSaveProfile(e) {
    e.preventDefault();
    const authUser = pfGetUser();
    if (!authUser) return;

    const name = document.getElementById("pfName").value.trim();
    if (!name) {
        pfShowToast("Name cannot be empty.", "error");
        return;
    }

    const payload = {
        name,
        phone: document.getElementById("pfPhone").value.trim(),
        role: document.getElementById("pfRole").value.trim(),
        organization: document.getElementById("pfOrganization").value.trim(),
        department: document.getElementById("pfDepartment").value.trim(),
        bio: document.getElementById("pfBio").value.trim(),
    };

    const btn = document.getElementById("pfSaveProfileBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    try {
        const res = await fetch(`${window.API_URL}/users/${authUser.id}/profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Could not save your profile.");

        pfUser = body;
        pfRenderProfile(body);
        pfSetEditing(false);
        pfShowToast("Profile updated.", "success");

        const stored = JSON.parse(localStorage.getItem("currentUser") || "null");
        if (stored) {
            stored.name = body.name;
            localStorage.setItem("currentUser", JSON.stringify(stored));
        }

    } catch (err) {
        pfShowToast(err.message || "Could not save your profile.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Save Changes"; }
    }
}

async function pfChangePassword(e) {
    e.preventDefault();
    const authUser = pfGetUser();
    if (!authUser) return;

    const current = document.getElementById("pfCurrentPassword").value;
    const next = document.getElementById("pfNewPassword").value;
    const confirmVal = document.getElementById("pfConfirmPassword").value;

    if (next !== confirmVal) {
        pfShowToast("New passwords don't match.", "error");
        return;
    }
    if (next.length < 6) {
        pfShowToast("New password must be at least 6 characters.", "error");
        return;
    }

    const btn = document.getElementById("pfChangePasswordBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Changing..."; }

    try {
        const res = await fetch(`${window.API_URL}/users/${authUser.id}/change-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_password: current, new_password: next }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || "Could not change your password.");

        pfShowToast("Password changed successfully.", "success");
        document.getElementById("pfPasswordForm").reset();

    } catch (err) {
        pfShowToast(err.message || "Could not change your password.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Change Password"; }
    }
}

async function pfToggleNotify() {
    const authUser = pfGetUser();
    if (!authUser) return;

    const checked = document.getElementById("pfNotifyToggle").checked;

    try {
        const res = await fetch(`${window.API_URL}/users/${authUser.id}/profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notify_email: checked }),
        });
        if (!res.ok) throw new Error("Could not save preference.");
        pfShowToast("Preference saved.", "success");
    } catch (err) {
        pfShowToast(err.message || "Could not save preference.", "error");
    }
}

function pfUploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
        localStorage.setItem("profileImage", reader.result);
        document.getElementById("profileImage").src = reader.result;
    };
    reader.readAsDataURL(file);
}

async function pfDeleteAccount() {
    const authUser = pfGetUser();
    if (!authUser) return;

    const confirmed = confirm(
        "This will permanently delete your account, meetings, transcripts, and AI summaries. This cannot be undone. Continue?"
    );
    if (!confirmed) return;

    const doubleConfirmed = confirm("Are you absolutely sure? This is your last chance to cancel.");
    if (!doubleConfirmed) return;

    try {
        const res = await fetch(`${window.API_URL}/users/${authUser.id}`, { method: "DELETE" });
        if (!res.ok) {
            const body = await res.json();
            throw new Error(body.detail || "Could not delete your account.");
        }

        localStorage.removeItem("currentUser");
        localStorage.removeItem("profileImage");
        alert("Your account has been deleted.");
        window.location.href = "login.html";

    } catch (err) {
        pfShowToast(err.message || "Could not delete your account.", "error");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const savedImage = localStorage.getItem("profileImage");
    if (savedImage) {
        document.getElementById("profileImage").src = savedImage;
    }

    pfLoadProfile();

    document.getElementById("pfEditBtn").addEventListener("click", () => pfSetEditing(true));
    document.getElementById("pfCancelBtn").addEventListener("click", () => {
        pfSetEditing(false);
        if (pfUser) pfRenderProfile(pfUser);
    });
    document.getElementById("pfProfileForm").addEventListener("submit", pfSaveProfile);
    document.getElementById("pfPasswordForm").addEventListener("submit", pfChangePassword);
    document.getElementById("pfNotifyToggle").addEventListener("change", pfToggleNotify);
    document.getElementById("pfAvatarInput").addEventListener("change", pfUploadAvatar);
    document.getElementById("pfDeleteAccountBtn").addEventListener("click", pfDeleteAccount);

    document.querySelectorAll(".pf-password-toggle").forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const input = document.getElementById(toggle.dataset.passwordTarget);
            const isVisible = input.type === "text";
            input.type = isVisible ? "password" : "text";
            toggle.setAttribute("aria-label", `${isVisible ? "Show" : "Hide"} password`);
            toggle.innerHTML = `<i class="fa-solid fa-eye${isVisible ? "" : "-slash"}"></i>`;
        });
    });
});
