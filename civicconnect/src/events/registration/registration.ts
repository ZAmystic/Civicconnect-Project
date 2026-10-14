import { assessPasswordStrength } from "../../utils/password_strength";

interface RegistrationResponse {
    success: boolean;
    message: string;
}

const registrationForm = document.querySelector<HTMLFormElement>(".auth-form");
const firstNameInput = document.querySelector<HTMLInputElement>("#first-name");
const lastNameInput = document.querySelector<HTMLInputElement>("#last-name");
const emailInput = document.querySelector<HTMLInputElement>("#reg-email");
const rPassword = document.querySelector<HTMLInputElement>("#reg-password");
const registrationMessage = document.querySelector<HTMLParagraphElement>(
    "#registration-message"
);
const submitButton = registrationForm?.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
);

function showRegistrationMessage(message: string, success = false): void {
    if (!registrationMessage) return;

    registrationMessage.textContent = message;
    registrationMessage.hidden = false;
    registrationMessage.classList.toggle("success", success);
}

registrationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!firstNameInput || !lastNameInput || !emailInput || !rPassword) {
        console.error("Registration form is missing a required input.");
        showRegistrationMessage("The registration form is unavailable. Please reload the page.");
        return;
    }

    if (registrationMessage) {
        registrationMessage.textContent = "";
        registrationMessage.hidden = true;
        registrationMessage.classList.remove("success");
    }

    if (submitButton) submitButton.disabled = true;

    try {
        const isPasswordStrong = await analyse_password(rPassword.value);
        if (!isPasswordStrong) {
            showRegistrationMessage(
                "Choose a stronger password before completing registration."
            );
            return;
        }

        const response = await fetch("/api/users/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                firstName: firstNameInput.value.trim(),
                lastName: lastNameInput.value.trim(),
                email: emailInput.value.trim(),
                password: rPassword.value
            })
        });

        const data: RegistrationResponse = await response.json();
        if (!response.ok || !data.success) {
            showRegistrationMessage(data.message || "Registration failed.");
            return;
        }

        registrationForm.reset();
        showRegistrationMessage(
            "Registration successful. You can now sign in.",
            true
        );
    } catch (error) {
        console.error("Registration request failed:", error);
        showRegistrationMessage("Unable to complete registration. Please try again.");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});

export async function analyse_password(password: string): Promise<boolean> {
    if (!password) {
        return false;
    }

    const { score, minimumStrength } = await assessPasswordStrength(password);
    return score >= minimumStrength;
}
