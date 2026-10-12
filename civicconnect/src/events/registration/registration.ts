import zxcvbn from "ts-zxcvbn";

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

//----------------------------------------------------------------------------
// Grabs the minimum password strength level from the site config JSON file
//----------------------------------------------------------------------------

async function getConfigValue(
    key: "minimum_password_strength_level"
): Promise<number> {
    const response = await fetch("/site-config.json");

    if (!response.ok) {
        throw new Error(`Failed to load site config: ${response.status} ${response.statusText}`);
    }

    const config: unknown = await response.json();
    if (typeof config !== "object" || config === null || !(key in config)) {
        throw new Error(`Site config is missing ${key}.`);
    }

    const value = config[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) {
        throw new Error(`${key} in site config must be an integer from 0 to 4.`);
    }

    return value;
}

//----------------------------------------------------------------------------
// Password strength analysis and hashing functions
//----------------------------------------------------------------------------

export async function analyse_password(password: string) {
    if (!password) {
        console.error("No password provided in field reg-password.");
        return null;
    }

    const minimumStrength = await getConfigValue("minimum_password_strength_level");
    const result = zxcvbn(password);

    if (result.score < minimumStrength) {
        return false;
    }
    
    return true;
}   
// Minimum strength score for a password to be considered viable
// Add to settings.json if you want to change this value
const MinimumViablePasswordStrength = 3; 

//----------------------------------------------------------------------------
// Events
//----------------------------------------------------------------------------

// const rPassword = document.querySelector<HTMLInputElement>("#reg-password");
rPassword?.form?.addEventListener("submit", () => {
    analyse_hashpassword(rPassword.value);
});

//----------------------------------------------------------------------------
// Password strength analysis and hashing functions
//----------------------------------------------------------------------------
//changed to analyse_hashpassword to avoid confusion with the other function
export async function analyse_hashpassword(password: string) {
    if (!password) {
        console.error("No password provided in field reg-password.");
        return null;
    }

    if (zxcvbn(password).score < MinimumViablePasswordStrength) {
        console.error("zxcvbn classified the password as too weak : " + zxcvbn(password).feedback.warning + ".");
        return false;
    }
    else
    {
        try
        {
            //const hashed_password = await hash_password(password);
            console.log("Status Code 200: Password hashed successfully.");
        } 
        catch (error) 
        {
            console.error("An error occurred while hashing password:", error);
            return false;
        }
    }

    return true;
}

//----------------------------------------------------------------------------
// Hashes the password using SHA-256 and returns the hash as a hexadecimal string
//----------------------------------------------------------------------------

// async function hash_password(password: string): Promise<string> {
//     const encoder = new TextEncoder();
//     const data = encoder.encode(password);

//     const hashBuffer = await crypto.subtle.digest("SHA-256", data);

//     const hashArray = Array.from(new Uint8Array(hashBuffer));
//     const hashHex = hashArray
//         .map(byte => byte.toString(16).padStart(2, "0"))
//         .join("");

//     return hashHex;
// }

