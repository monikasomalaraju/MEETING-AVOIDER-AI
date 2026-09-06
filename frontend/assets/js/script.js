window.API_URL = window.API_URL || "http://127.0.0.1:8000"; // ✅ FIXED (important)

// SIGNUP
async function signup() {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
    }

    const btn = document.getElementById("signupBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Creating Account..."; }

    try {
        const response = await fetch(`${window.API_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || "Signup failed");
            if (btn) { btn.disabled = false; btn.textContent = "Create Account"; }
            return;
        }

        const user = await response.json();

        // ✅ STORE USER + USER_ID
        localStorage.setItem("currentUser", JSON.stringify(user));
        localStorage.setItem("user_id", user.id);  // ⭐ IMPORTANT

        alert("Signup successful!");
        window.location.href = "login.html";

    } catch (error) {
        alert("Error: " + error.message);
        if (btn) { btn.disabled = false; btn.textContent = "Create Account"; }
    }
}


// LOGIN
async function login() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Logging in..."; }

    try {
        const response = await fetch(`${window.API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            alert("Incorrect email or password");
            if (btn) { btn.disabled = false; btn.textContent = "Login"; }
            return;
        }

        const data = await response.json();

        // ✅ STORE USER + USER_ID
        localStorage.setItem("currentUser", JSON.stringify(data.user));
        localStorage.setItem("user_id", data.user.id);  // ⭐ IMPORTANT

        window.location.href = "dashboard.html";

    } catch (error) {
        alert("Error: " + error.message);
        if (btn) { btn.disabled = false; btn.textContent = "Login"; }
    }
}


// DASHBOARD PROTECTION
function protectPage() {
    const user = localStorage.getItem("currentUser");
    if (!user) {
        alert("Please login first");
        window.location.href = "login.html";
    }
}


// LOGOUT
function logout() {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("user_id");  
    window.location.href = "login.html";
}



function resetPassword() {
    alert("Password reset feature is not available yet.");
}
