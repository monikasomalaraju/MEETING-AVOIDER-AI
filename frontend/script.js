function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // Dummy credentials (for project)
    if (email === "admin@gmail.com" && password === "1234") {

        // save login status
        localStorage.setItem("loggedIn", "true");

        // go to dashboard
        window.location.href = "dashboard/dashboard.html";
    } else {
        alert("Invalid email or password");
    }
}

function signup() {
    alert("Account created successfully!");
    window.location.href = "login.html";
}

function resetPassword() {
    alert("Password reset link sent to your email");
}
