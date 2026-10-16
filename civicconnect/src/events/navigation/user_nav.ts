interface CurrentUserResponse {
    success: boolean;
    user?: {
        full_name: string;
        full_surname: string | null;
        email: string;
        role: string;
        canManageUsers: boolean;
        canViewContractorDashboard: boolean;
        canViewAuditLogs: boolean;
    };
}

interface CachedNavigationUser {
    full_name: string;
    full_surname: string | null;
    role: string;
    canManageUsers: boolean;
    canViewContractorDashboard: boolean;
    canViewAuditLogs: boolean;
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

const navigationUserStorageKey = "civicconnect_current_user";

function readCachedNavigationUser(): CachedNavigationUser | null {
    try {
        const value: unknown = JSON.parse(
            sessionStorage.getItem(navigationUserStorageKey) ?? "null"
        );
        if (
            typeof value !== "object" ||
            value === null ||
            !("full_name" in value) ||
            typeof value.full_name !== "string" ||
            !("full_surname" in value) ||
            (value.full_surname !== null && typeof value.full_surname !== "string") ||
            !("role" in value) ||
            typeof value.role !== "string" ||
            !("canManageUsers" in value) ||
            typeof value.canManageUsers !== "boolean" ||
            !("canViewContractorDashboard" in value) ||
            typeof value.canViewContractorDashboard !== "boolean" ||
            !("canViewAuditLogs" in value) ||
            typeof value.canViewAuditLogs !== "boolean"
        ) {
            return null;
        }
        return {
            full_name: value.full_name,
            full_surname: value.full_surname,
            role: value.role,
            canManageUsers: value.canManageUsers,
            canViewContractorDashboard: value.canViewContractorDashboard,
            canViewAuditLogs: value.canViewAuditLogs
        };
    } catch {
        return null;
    }
}

function cacheNavigationUser(user: CachedNavigationUser): void {
    try {
        sessionStorage.setItem(navigationUserStorageKey, JSON.stringify(user));
    } catch (error) {
        console.warn("Unable to cache navigation details for this tab:", error);
    }
}

function clearCachedNavigationUser(): void {
    try {
        sessionStorage.removeItem(navigationUserStorageKey);
    } catch (error) {
        console.warn("Unable to clear cached navigation details:", error);
    }
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
    const navigation = document.querySelector<HTMLElement>(".sidebar-nav");
    const administrationSection = Array.from(
        navigation?.querySelectorAll<HTMLElement>(".nav-section") ?? []
    ).find((section) =>
        section.querySelector(".nav-section-title")?.textContent?.trim() === "Administration"
    );
    let auditLogsLink = document.querySelector<HTMLAnchorElement>("#auditLogsNav");
    if (!auditLogsLink && navigation) {
        auditLogsLink = Array.from(
            navigation.querySelectorAll<HTMLAnchorElement>(".nav-item")
        ).find((link) =>
            link.querySelector("span:last-child")?.textContent?.trim() === "Audit Logs"
        ) ?? null;
    }
    if (!auditLogsLink && navigation) {
        auditLogsLink = document.createElement("a");
        auditLogsLink.className = "nav-item";
        auditLogsLink.id = "auditLogsNav";
        auditLogsLink.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">history</span><span>Audit Logs</span>';
        navigation.append(auditLogsLink);
    }
    if (auditLogsLink) {
        auditLogsLink.id = "auditLogsNav";
        auditLogsLink.href = "aduit_logs.html";
        auditLogsLink.hidden = true;
    }
    if (userManagementLink) {
        userManagementLink.hidden = true;
    }
    if (settingsLink) {
        settingsLink.hidden = true;
    }
    let ticketManagementLink = document.querySelector<HTMLAnchorElement>(
        "#ticketManagementNav"
    );
    if (!ticketManagementLink && navigation) {
        ticketManagementLink = document.createElement("a");
        ticketManagementLink.className = "nav-item";
        ticketManagementLink.id = "ticketManagementNav";
        ticketManagementLink.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span><span>Ticket Management</span>';
        const operationsSection = Array.from(
            navigation.querySelectorAll<HTMLElement>(".nav-section")
        ).find((section) =>
            section.querySelector(".nav-section-title")?.textContent?.trim() === "Operations"
        );
        if (operationsSection) {
            operationsSection.insertAdjacentElement("afterend", ticketManagementLink);
        } else {
            navigation.append(ticketManagementLink);
        }
    }
    if (ticketManagementLink) {
        ticketManagementLink.href = "ticket_management.html";
        ticketManagementLink.hidden = true;
    }
    let contractorDashboardLink = document.querySelector<HTMLAnchorElement>(
        "#contractorDashboardNav"
    );
    if (!contractorDashboardLink && navigation) {
        contractorDashboardLink = document.createElement("a");
        contractorDashboardLink.className = "nav-item";
        contractorDashboardLink.id = "contractorDashboardNav";
        contractorDashboardLink.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">engineering</span><span>Contractor Dashboard</span>';
        const operationsSection = Array.from(
            navigation.querySelectorAll<HTMLElement>(".nav-section")
        ).find((section) =>
            section.querySelector(".nav-section-title")?.textContent?.trim() === "Operations"
        );
        if (ticketManagementLink && operationsSection) {
            ticketManagementLink.insertAdjacentElement("afterend", contractorDashboardLink);
        } else if (operationsSection) {
            operationsSection.insertAdjacentElement("afterend", contractorDashboardLink);
        } else {
            navigation.append(contractorDashboardLink);
        }
    }
    if (contractorDashboardLink) {
        contractorDashboardLink.href = "contractor_dashboard.html";
        contractorDashboardLink.hidden = true;
    }
    let reportsAnalyticsLink = document.querySelector<HTMLAnchorElement>(
        "#reportsAnalyticsNav"
    );
    if (!reportsAnalyticsLink && navigation) {
        reportsAnalyticsLink = Array.from(
            navigation.querySelectorAll<HTMLAnchorElement>(".nav-item")
        ).find((link) =>
            link.querySelector("span:last-child")?.textContent?.trim() === "Reports & Analytics"
        ) ?? null;
    }
    if (!reportsAnalyticsLink && navigation) {
        reportsAnalyticsLink = document.createElement("a");
        reportsAnalyticsLink.className = "nav-item";
        reportsAnalyticsLink.id = "reportsAnalyticsNav";
        reportsAnalyticsLink.innerHTML =
            '<span class="material-symbols-outlined" aria-hidden="true">insights</span><span>Reports &amp; Analytics</span>';
        const intelligenceSection = Array.from(
            navigation.querySelectorAll<HTMLElement>(".nav-section")
        ).find((section) =>
            section.querySelector(".nav-section-title")?.textContent?.trim() === "Intelligence"
        );
        if (intelligenceSection) {
            intelligenceSection.insertAdjacentElement("afterend", reportsAnalyticsLink);
        } else {
            navigation.append(reportsAnalyticsLink);
        }
    }
    if (reportsAnalyticsLink) {
        reportsAnalyticsLink.id = "reportsAnalyticsNav";
        reportsAnalyticsLink.href = "reports_analytics.html";
        reportsAnalyticsLink.hidden = true;
    }
    const updateAdministrationSection = (): void => {
        if (administrationSection) {
            administrationSection.hidden = ![
                userManagementLink,
                settingsLink,
                auditLogsLink
            ].some((link) => link && !link.hidden);
        }
    };
    updateAdministrationSection();
    const createTicketLink = document.querySelector<HTMLAnchorElement>("#createTicketNav");
    const serviceRequestsSection = Array.from(
        document.querySelectorAll<HTMLElement>(".sidebar-nav .nav-section")
    ).find((section) =>
        section.querySelector(".nav-section-title")?.textContent?.trim() === "Service Requests"
    );
    const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
    const requiresUserManagementAccess =
        currentPath.endsWith("/user_management.html") ||
        currentPath.endsWith("/settings.html");
    const requiresAuditLogAccess = currentPath.endsWith("/aduit_logs.html");
    const requiresTicketManagementAccess =
        currentPath.endsWith("/ticket_management.html");
    const requiresContractorDashboardAccess =
        currentPath.endsWith("/contractor_dashboard.html");
    const requiresReportsAnalyticsAccess =
        currentPath.endsWith("/reports_analytics.html");
    const requiresProtectedPageAccess =
        requiresUserManagementAccess ||
        requiresAuditLogAccess ||
        requiresTicketManagementAccess ||
        requiresContractorDashboardAccess ||
        requiresReportsAnalyticsAccess;

    const servicePages = [
        { href: "facility_faults.html", icon: "apartment", label: "Facility Faults" },
        {
            href: "damaged_equipment.html",
            icon: "local_shipping",
            label: "Damaged Equipment"
        },
        { href: "general_request.html", icon: "assignment", label: "General Request" },
        { href: "security_concerns.html", icon: "shield", label: "Security Concerns" },
        { href: "it_support.html", icon: "laptop", label: "IT Support" },
        { href: "maintenance_request.html", icon: "handyman", label: "Maintenance" },
        { href: "lost_property.html", icon: "inventory_2", label: "Lost Property" }
    ];

    if (
        createTicketLink &&
        serviceRequestsSection &&
        serviceRequestsSection.dataset.servicePagesAdded !== "true"
    ) {
        let insertionPoint: Element = serviceRequestsSection;
        for (const page of servicePages) {
            const link = document.createElement("a");
            link.className = "nav-item service-page-nav-item";
            link.href = new URL(page.href, window.location.href).pathname;

            const icon = document.createElement("span");
            icon.className = "material-symbols-outlined";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = page.icon;

            const label = document.createElement("span");
            label.textContent = page.label;

            link.append(icon, label);
            insertionPoint.insertAdjacentElement("afterend", link);
            insertionPoint = link;
        }
        serviceRequestsSection.dataset.servicePagesAdded = "true";
    }

    const fallbackNavItem = currentPath.endsWith("/user_management.html")
        ? userManagementLink
        : currentPath.endsWith("/settings.html")
          ? settingsLink
          : document.getElementById("requesterNav");
    let signedInUser: CurrentUserResponse["user"];

    const applyNavigationUser = (user: CachedNavigationUser): void => {
        const displayName = [user.full_name, user.full_surname]
            .filter((part) => part?.trim())
            .join(" ");
        if (nameElement) {
            nameElement.textContent = displayName || "User";
        }
        if (roleElement) {
            roleElement.textContent = user.role;
        }
        if (userManagementLink) {
            userManagementLink.hidden = !user.canManageUsers;
        }
        if (settingsLink) {
            settingsLink.hidden = !user.canManageUsers;
        }
        if (auditLogsLink) {
            auditLogsLink.hidden = !user.canViewAuditLogs;
        }
        if (ticketManagementLink) {
            ticketManagementLink.hidden = !user.canViewAuditLogs;
        }
        if (contractorDashboardLink) {
            contractorDashboardLink.hidden = !user.canViewContractorDashboard;
        }
        if (reportsAnalyticsLink) {
            reportsAnalyticsLink.hidden = !user.canViewAuditLogs;
        }
        updateAdministrationSection();
    };

    const cachedUser = readCachedNavigationUser();
    if (cachedUser) {
        applyNavigationUser(cachedUser);
    }

    const redirectToNotFound = (): void => {
        window.location.replace("/src/pages/404.html");
    };

    let matchedNavItem = false;
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
            matchedNavItem = true;
        }
    });

    if (!matchedNavItem && fallbackNavItem) {
        fallbackNavItem.classList.add("active");
        fallbackNavItem.setAttribute("aria-current", "page");
    }

    if (userManagementLink) {
        userManagementLink.hidden = true;
    }
    if (settingsLink) {
        settingsLink.hidden = true;
    }
    if (auditLogsLink) {
        auditLogsLink.hidden = true;
    }
    updateAdministrationSection();
    try {
        const response = await fetch("/api/users/me");
        if (!response.ok) {
            if (requiresProtectedPageAccess) {
                redirectToNotFound();
                return;
            }
            throw new Error(`Failed to load current user (${response.status}).`);
        }

        const data: CurrentUserResponse = await response.json();
        if (!data.success || !data.user) {
            if (requiresProtectedPageAccess) {
                redirectToNotFound();
                return;
            }
            throw new Error("Current-user response is invalid.");
        }
        signedInUser = data.user;
        if (
            (requiresUserManagementAccess && !data.user.canManageUsers) ||
            ((requiresAuditLogAccess ||
                requiresTicketManagementAccess ||
                requiresReportsAnalyticsAccess) &&
                !data.user.canViewAuditLogs) ||
            (requiresContractorDashboardAccess &&
                !data.user.canViewContractorDashboard)
        ) {
            redirectToNotFound();
            return;
        }

        applyNavigationUser(data.user);
        cacheNavigationUser({
            full_name: data.user.full_name,
            full_surname: data.user.full_surname,
            role: data.user.role,
            canManageUsers: data.user.canManageUsers,
            canViewContractorDashboard: data.user.canViewContractorDashboard,
            canViewAuditLogs: data.user.canViewAuditLogs
        });
    } catch (error) {
        if (requiresProtectedPageAccess) {
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
            clearCachedNavigationUser();
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
                const { assessPasswordStrength } = await import(
                    "../../utils/password_strength"
                );
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
            cacheNavigationUser({
                full_name: signedInUser.full_name,
                full_surname: signedInUser.full_surname,
                role: signedInUser.role,
                canManageUsers: signedInUser.canManageUsers,
                canViewContractorDashboard: signedInUser.canViewContractorDashboard,
                canViewAuditLogs: signedInUser.canViewAuditLogs
            });
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
