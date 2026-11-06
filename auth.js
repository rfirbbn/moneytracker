// ===== MoneyTrack - login / register / reset password =====

const messageEl = document.getElementById("authMessage");

function showAuthMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = "auth-message " + (type || "");
}

function setBusy(form, busy) {
    form.querySelector("button[type=submit]").disabled = busy;
}

// Links in emails must point back to this site (works when served over http/https)
function pageUrl(name) {
    return location.protocol.startsWith("http") ? new URL(name, location.href).href : undefined;
}

// Already logged in? No need to see the login / register page
if (document.body.dataset.redirectIfLoggedIn) {
    db.auth.getSession().then(({ data }) => {
        if (data.session) location.href = "dashboard.html";
    });
}

// --- Log in + forgot password ---
const loginForm = document.getElementById("loginForm");
if (loginForm) {
    const resetForm = document.getElementById("resetForm");

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setBusy(loginForm, true);
        showAuthMessage("Logging in…");

        const { error } = await db.auth.signInWithPassword({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
        });

        if (error) {
            showAuthMessage(error.message, "error");
            setBusy(loginForm, false);
            return;
        }
        location.href = "dashboard.html";
    });

    document.getElementById("showReset").addEventListener("click", () => {
        resetForm.hidden = false;
        loginForm.hidden = true;
        document.getElementById("resetEmail").value = document.getElementById("email").value;
        showAuthMessage("");
    });

    document.getElementById("showLogin").addEventListener("click", () => {
        resetForm.hidden = true;
        loginForm.hidden = false;
        showAuthMessage("");
    });

    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setBusy(resetForm, true);

        const { error } = await db.auth.resetPasswordForEmail(
            document.getElementById("resetEmail").value.trim(),
            { redirectTo: pageUrl("reset-password.html") }
        );

        setBusy(resetForm, false);
        if (error) showAuthMessage(error.message, "error");
        else showAuthMessage("If that email has an account, a reset link is on its way.", "ok");
    });
}

// --- Register ---
const registerForm = document.getElementById("registerForm");
if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = document.getElementById("password").value;
        if (password !== document.getElementById("password2").value) {
            showAuthMessage("The two passwords are not the same.", "error");
            return;
        }

        setBusy(registerForm, true);
        showAuthMessage("Creating your account…");

        const { data, error } = await db.auth.signUp({
            email: document.getElementById("email").value.trim(),
            password: password,
            options: { emailRedirectTo: pageUrl("dashboard.html") }
        });

        setBusy(registerForm, false);

        if (error) {
            showAuthMessage(error.message, "error");
        } else if (data.session) {
            location.href = "dashboard.html"; // email confirmation is switched off
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
            showAuthMessage("This email already has an account. Try logging in.", "error");
        } else {
            showAuthMessage("Almost done! Check your email and click the link to confirm your account, then log in.", "ok");
            registerForm.reset();
        }
    });
}

// --- Choose a new password (opened from the reset email) ---
const newPasswordForm = document.getElementById("newPasswordForm");
if (newPasswordForm) {
    newPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const password = document.getElementById("password").value;
        if (password !== document.getElementById("password2").value) {
            showAuthMessage("The two passwords are not the same.", "error");
            return;
        }

        setBusy(newPasswordForm, true);
        const { error } = await db.auth.updateUser({ password: password });
        setBusy(newPasswordForm, false);

        if (error) {
            showAuthMessage(error.message + " (Open this page from the link in the reset email.)", "error");
        } else {
            showAuthMessage("Password changed! Taking you to the app…", "ok");
            setTimeout(() => (location.href = "dashboard.html"), 1500);
        }
    });
}
