import zxcvbn from "ts-zxcvbn";

//----------------------------------------------------------------------------
// Events for the registration form
//----------------------------------------------------------------------------

const rPassword = document.querySelector<HTMLInputElement>("#reg-password");
rPassword?.form?.addEventListener("submit", () => {
    void analyse_password(rPassword.value).catch((error: unknown) => {
        console.error("Unable to analyze password strength.", error);
    });
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
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value >= 4) {
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
        console.error(
            `zxcvbn classified the password as too weak: ${result.feedback.warning}. Minimum strength: ${minimumStrength}.`
        );
        return false;
    }
    
    return true;
}   

