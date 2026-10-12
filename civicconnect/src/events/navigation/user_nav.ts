interface CurrentUserResponse {
    success: boolean;
    user?: {
        full_name: string;
        full_surname: string | null;
        role: string;
        canManageUsers: boolean;
    };
}

export async function initializeUserNavigation(): Promise<void> {
    const nameElement = document.querySelector<HTMLElement>(".profile-name");
    const roleElement = document.querySelector<HTMLElement>(".profile-role");
    const userManagementLink = document.querySelector<HTMLElement>(
        "#userManagementNav"
    );

    if (userManagementLink) {
        userManagementLink.hidden = true;
    }

    try {
        const response = await fetch("/api/users/me");
        if (!response.ok) {
            throw new Error(`Failed to load current user (${response.status}).`);
        }

        const data: CurrentUserResponse = await response.json();
        if (!data.success || !data.user) {
            throw new Error("Current-user response is invalid.");
        }

        const displayName = [data.user.full_name, data.user.full_surname]
            .filter((part) => part?.trim())
            .join(" ");
        if (nameElement) {
            nameElement.textContent = displayName || "User";
        }
        if (roleElement) {
            roleElement.textContent = data.user.role;
        }
        if (userManagementLink) {
            userManagementLink.hidden = !data.user.canManageUsers;
        }
    } catch (error) {
        if (nameElement) {
            nameElement.textContent = "User";
        }
        if (roleElement) {
            roleElement.textContent = "Not signed in";
        }
        console.error("Unable to load signed-in user details:", error);
    }
}
