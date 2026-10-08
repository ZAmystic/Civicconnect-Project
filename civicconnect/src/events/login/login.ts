
interface LoginResponse {
    success: boolean;
    message: string;
    user?: {
        user_id: number;
        full_name: string;
        full_surname: string;
        email: string;
        role: string;
    };
}

const loginForm = document.querySelector<HTMLFormElement>(
    ".auth-form"
);

const emailInput = document.querySelector<HTMLInputElement>(
    "#login-email"
);

const passwordInput = document.querySelector<HTMLInputElement>(
    "#login-password"
);

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        const response = await fetch("/api/users/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data: LoginResponse = await response.json();

        if (!response.ok || !data.success) {
            alert(data.message || "Login failed.");
            return;
        }

        console.log("Authenticated user:", data.user);

        // Redirect after successful authentication
        window.location.assign("/src/pages/dashboard.html");

    } catch (error) {
        console.error("Login request failed:", error);
        alert("Unable to connect to the server.");
    }
});
