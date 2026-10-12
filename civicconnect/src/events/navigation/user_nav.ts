import { assessPasswordStrength } from "../../utils/password_strength";

interface CurrentUserResponse {
    success: boolean;
    user?: {
        full_name: string;
        full_surname: string | null;
        email: string;
        role: string;
        canManageUsers: boolean;
    };
}

interface AccountUpdateResponse {
    success: boolean;
    message: string;
    user?: {
        full_name: string;
        full_surname: string | null;
        email: string;
    };
}

export async function initializeUserNavigation(): Promise<void> {
    const nameElement = document.querySelector<HTMLElement>(".profile-name");
    const roleElement = document.querySelector<HTMLElement>(".profile-role");
    const profileButton = document.getElementById(
        "accountProfileButton"
    ) as HTMLButtonElement | null;
    const accountDialog = document.getElementById(
        "accountSettingsDialog"
    ) as HTMLDialogElement | null;
    const accountForm = document.getElementById(
        "accountSettingsForm"
    ) as HTMLFormElement | null;
    const accountMessage = document.getElementById(
        "accountSettingsMessage"
    ) as HTMLParagraphElement | null;
    const saveButton = document.getElementById(
        "saveAccountSettings"
    ) as HTMLButtonElement | null;
    const fullNameInput = document.getElementById(
        "accountFullName"
    ) as HTMLInputElement | null;
    const surnameInput = document.getElementById(
        "accountSurname"
    ) as HTMLInputElement | null;
    const emailInput = document.getElementById(
        "accountEmail"
    ) as HTMLInputElement | null;
    const currentPasswordInput = document.getElementById(
        "accountCurrentPassword"
    ) as HTMLInputElement | null;
    const newPasswordInput = document.getElementById(
        "accountNewPassword"
    ) as HTMLInputElement | null;
    const confirmPasswordInput = document.getElementById(
        "accountConfirmPassword"
    ) as HTMLInputElement | null;
    const userManagementLink = document.querySelector<HTMLElement>(
        "#userManagementNav"
    );
    const settingsLink = document.querySelector<HTMLElement>("#settingsNav");
    let signedInUser: CurrentUserResponse["user"];

    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    const requiresUserManagementAccess =
        currentPath.endsWith("/user_management.html") ||
        currentPath.endsWith("/settings.html");

    const redirectToNotFound = (): void => {
        window.location.replace("/src/pages/404.html");
    };

    document.querySelectorAll<HTMLAnchorElement>(".sidebar-nav .nav-item[href]").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");

        const href = item.getAttribute("href");
        if (!href || href.startsWith("#")) {
            return;
        }

        const target = new URL(href, window.location.href);
        const targetPath = target.pathname.replace(/\/+$/, "") || "/";
        if (target.origin === window.location.origin && targetPath === currentPath) {
            item.classList.add("active");
            item.setAttribute("aria-current", "page");
        }
    });

    if (userManagementLink) {
        userManagementLink.hidden = true;
    }
    try {
        const response = await fetch("/api/users/me");
        if (!response.ok) {
            if (requiresUserManagementAccess) {
                redirectToNotFound();
                return;
            }
            throw new Error(`Failed to load current user (${response.status}).`);
        }

        const data: CurrentUserResponse = await response.json();
        if (!data.success || !data.user) {
            if (requiresUserManagementAccess) {
                redirectToNotFound();
                return;
            }
            throw new Error("Current-user response is invalid.");
        }
        signedInUser = data.user;
        if (requiresUserManagementAccess && !data.user.canManageUsers) {
            redirectToNotFound();
            return;
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
        if (settingsLink) {
            settingsLink.hidden = !data.user.canManageUsers;
        }
    } catch (error) {
        if (requiresUserManagementAccess) {
            console.error("Unable to verify access to this page:", error);
            redirectToNotFound();
            return;
        }
        if (nameElement) {
            nameElement.textContent = "User";
        }
        if (roleElement) {
            roleElement.textContent = "Not signed in";
        }
        console.error("Unable to load signed-in user details:", error);
    }

    profileButton?.addEventListener("click", () => {
        if (
            !signedInUser ||
            !accountDialog ||
            !accountMessage ||
            !fullNameInput ||
            !surnameInput ||
            !emailInput
        ) {
            return;
        }

        accountMessage.textContent = "";
        accountMessage.classList.remove("success");
        fullNameInput.value = signedInUser.full_name;
        surnameInput.value = signedInUser.full_surname ?? "";
        emailInput.value = signedInUser.email;
        if (currentPasswordInput) currentPasswordInput.value = "";
        if (newPasswordInput) newPasswordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";
        accountDialog.showModal();
        fullNameInput.focus();
    });

    document.getElementById("closeAccountSettings")?.addEventListener("click", () => {
        accountDialog?.close();
    });
    document.getElementById("cancelAccountSettings")?.addEventListener("click", () => {
        accountDialog?.close();
    });
    document.getElementById("accountSignOut")?.addEventListener("click", async () => {
        const signOutButton = document.getElementById(
            "accountSignOut"
        ) as HTMLButtonElement | null;
        if (signOutButton) signOutButton.disabled = true;

        try {
            const response = await fetch("/api/users/logout", { method: "POST" });
            const data: { success: boolean; message?: string } = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to sign out.");
            }
            window.location.replace("/src/pages/login.html");
        } catch (error) {
            if (signOutButton) signOutButton.disabled = false;
            if (accountMessage) {
                accountMessage.textContent = error instanceof Error
                    ? error.message
                    : "Unable to sign out.";
                accountMessage.classList.remove("success");
            }
        }
    });
    accountDialog?.addEventListener("click", (event: MouseEvent) => {
        if (event.target === accountDialog) accountDialog.close();
    });

    accountForm?.addEventListener("submit", async (event: SubmitEvent) => {
        event.preventDefault();
        if (
            !signedInUser ||
            !accountMessage ||
            !saveButton ||
            !fullNameInput ||
            !surnameInput ||
            !emailInput ||
            !currentPasswordInput ||
            !newPasswordInput ||
            !confirmPasswordInput
        ) {
            return;
        }

        accountMessage.textContent = "";
        accountMessage.classList.remove("success");
        saveButton.disabled = true;
        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        try {
            if (newPassword || currentPassword || confirmPassword) {
                if (!currentPassword || !newPassword || !confirmPassword) {
                    throw new Error(
                        "Enter your current password, new password, and confirmation to change your password."
                    );
                }
                if (newPassword !== confirmPassword) {
                    throw new Error("New password and confirmation do not match.");
                }
                const assessment = await assessPasswordStrength(newPassword);
                if (assessment.score < assessment.minimumStrength) {
                    throw new Error(
                        `Choose a stronger password (strength level ${assessment.minimumStrength} required).`
                    );
                }
            }

            const response = await fetch("/api/users/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullNameInput.value.trim(),
                    full_surname: surnameInput.value.trim(),
                    email: emailInput.value.trim(),
                    ...(newPassword
                        ? {
                            current_password: currentPassword,
                            new_password: newPassword,
                            confirm_password: confirmPassword
                        }
                        : {})
                })
            });
            const data: AccountUpdateResponse = await response.json();
            if (!response.ok || !data.success || !data.user) {
                throw new Error(data.message || "Failed to update account.");
            }

            signedInUser = {
                ...signedInUser,
                ...data.user
            };
            if (nameElement) {
                nameElement.textContent = [data.user.full_name, data.user.full_surname]
                    .filter((part) => part?.trim())
                    .join(" ");
            }
            accountMessage.textContent = data.message;
            accountMessage.classList.add("success");
            currentPasswordInput.value = "";
            newPasswordInput.value = "";
            confirmPasswordInput.value = "";
        } catch (error) {
            console.error("Unable to update account:", error);
            accountMessage.textContent = error instanceof Error
                ? error.message
                : "Failed to update account.";
        } finally {
            saveButton.disabled = false;
        }
    });
}
