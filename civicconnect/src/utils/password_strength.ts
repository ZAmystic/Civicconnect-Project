import zxcvbn from "ts-zxcvbn";

export interface PasswordStrengthAssessment {
    score: number;
    minimumStrength: number;
}

export async function assessPasswordStrength(
    password: string
): Promise<PasswordStrengthAssessment> {
    const response = await fetch("/site-config.json");
    if (!response.ok) {
        throw new Error(
            `Failed to load site config: ${response.status} ${response.statusText}`
        );
    }

    const config: unknown = await response.json();
    if (
        typeof config !== "object" ||
        config === null ||
        !("minimum_password_strength_level" in config)
    ) {
        throw new Error("Site config is missing minimum_password_strength_level.");
    }

    const minimumStrength = config.minimum_password_strength_level;
    if (
        typeof minimumStrength !== "number" ||
        !Number.isInteger(minimumStrength) ||
        minimumStrength < 0 ||
        minimumStrength > 4
    ) {
        throw new Error(
            "minimum_password_strength_level in site config must be an integer from 0 to 4."
        );
    }

    return {
        score: zxcvbn(password).score,
        minimumStrength
    };
}
