import zxcvbn from "ts-zxcvbn";

// Minimum strength score for a password to be considered viable
// Add to settings.json if you want to change this value
const MinimumViablePasswordStrength = 3;

//----------------------------------------------------------------------------
// Events
//----------------------------------------------------------------------------

const rPassword = document.querySelector<HTMLInputElement>("#reg-password");
rPassword?.form?.addEventListener("submit", () => {
    analyse_password(rPassword.value);
});

//----------------------------------------------------------------------------
// Password strength analysis and hashing functions
//----------------------------------------------------------------------------

export async function analyse_password(password: string) {
    if (!password) {
        console.error("No password provided in field reg-password.");
        return null;
    }

    if (zxcvbn(password).score < MinimumViablePasswordStrength) {
        console.error("zxcvbn classified the password as too weak : " + zxcvbn(password).feedback.warning + ".");
        return false;
    }
    else {
        try {
            const hashed_password = await hash_password(password);
            console.log("Status Code 200: Password hashed successfully.");
        }
        catch (error) {
            console.error("An error occurred while hashing password:", error);
            return false;
        }
    }

    return true;
}

//----------------------------------------------------------------------------
// Hashes the password using SHA-256 and returns the hash as a hexadecimal string
//----------------------------------------------------------------------------

async function hash_password(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    return hashHex;
}

