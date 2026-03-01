const API_URL = "http://localhost:8000";

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

    try {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.detail || "Signup failed");
            return;
        }

        const user = await response.json();
        localStorage.setItem("currentUser", JSON.stringify(user));
        alert("Signup successful!");
        window.location.href = "login.html";
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// LOGIN
async function login() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            alert("Incorrect email or password");
            return;
        }

        const data = await response.json();
        localStorage.setItem("currentUser", JSON.stringify(data.user));
        window.location.href = "dashboard.html";
    } catch (error) {
        alert("Error: " + error.message);
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
    window.location.href = "login.html";
}

// utility stub for forgot password page
function resetPassword() {
    alert("Password reset feature is not available yet.");
}
