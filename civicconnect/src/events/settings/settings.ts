interface EditableSettings {
    security: {
        minimum_password_strength_level: number;
        session_timeout_minutes: number;
        max_login_attempts: number;
    };
    users: {
        allow_user_registration: boolean;
        default_user_role: string;
        allow_profile_editing: boolean;
    };
    audit: {
        enable_audit_logging: boolean;
        log_failed_login_attempts: boolean;
        audit_log_retention_days: number;
    };
    permissions: {
        allow_staff_user_management: boolean;
        allow_staff_settings_access: boolean;
    };
}

interface SiteConfig extends EditableSettings {
    general: {
        site_name: string;
        site_description: string;
        default_language: string;
        default_timezone: string;
        date_format: string;
    };
}

interface SettingsResponse {
    success: boolean;
    message?: string;
    config?: SiteConfig;
}

interface DatabaseStatusResponse {
    success: boolean;
    message?: string;
    password_strength_checker?: {
        name: string;
        status: "available" | "unavailable";
    };
    database?: {
        status: "connected" | "disconnected";
        engine: string;
        pool?: {
            total: number;
            idle: number;
            waiting: number;
        };
        response_time_ms?: number;
        checked_at: string;
    };
}

const settingsLayout = document.getElementById("settingsLayout");
const accessMessage = document.getElementById("settingsAccessMessage");
const saveMessage = document.getElementById("settingsSaveMessage");
const saveButton = document.getElementById(
    "saveSystemSettings"
) as HTMLButtonElement | null;

function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Settings control "${id}" was not found.`);
    return element as T;
}

function showMessage(
    element: HTMLElement | null,
    message: string,
    isError = false
): void {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
}

function fillSettings(config: SiteConfig): void {
    getElement("generalSiteName").textContent = config.general.site_name;
    getElement("generalSiteDescription").textContent = config.general.site_description;
    getElement("generalLanguage").textContent = config.general.default_language;
    getElement("generalTimezone").textContent = config.general.default_timezone;
    getElement("generalDateFormat").textContent = config.general.date_format;

    getElement<HTMLSelectElement>("minimumPasswordStrength").value =
        String(config.security.minimum_password_strength_level);
    getElement<HTMLInputElement>("sessionTimeout").value =
        String(config.security.session_timeout_minutes);
    getElement<HTMLInputElement>("maxLoginAttempts").value =
        String(config.security.max_login_attempts);

    getElement<HTMLSelectElement>("defaultUserRole").value = config.users.default_user_role;
    getElement<HTMLInputElement>("allowRegistration").checked =
        config.users.allow_user_registration;
    getElement<HTMLInputElement>("allowProfileEditing").checked =
        config.users.allow_profile_editing;

    getElement<HTMLInputElement>("enableAuditLogging").checked =
        config.audit.enable_audit_logging;
    getElement<HTMLInputElement>("logFailedLoginAttempts").checked =
        config.audit.log_failed_login_attempts;
    getElement<HTMLInputElement>("auditRetention").value =
        String(config.audit.audit_log_retention_days);

    getElement<HTMLInputElement>("allowStaffUserManagement").checked =
        config.permissions.allow_staff_user_management;
    getElement<HTMLInputElement>("allowStaffSettingsAccess").checked =
        config.permissions.allow_staff_settings_access;
}

function readEditableSettings(): EditableSettings {
    return {
        security: {
            minimum_password_strength_level: Number(
                getElement<HTMLSelectElement>("minimumPasswordStrength").value
            ),
            session_timeout_minutes: Number(
                getElement<HTMLInputElement>("sessionTimeout").value
            ),
            max_login_attempts: Number(
                getElement<HTMLInputElement>("maxLoginAttempts").value
            )
        },
        users: {
            allow_user_registration:
                getElement<HTMLInputElement>("allowRegistration").checked,
            default_user_role: getElement<HTMLSelectElement>("defaultUserRole").value,
            allow_profile_editing:
                getElement<HTMLInputElement>("allowProfileEditing").checked
        },
        audit: {
            enable_audit_logging:
                getElement<HTMLInputElement>("enableAuditLogging").checked,
            log_failed_login_attempts:
                getElement<HTMLInputElement>("logFailedLoginAttempts").checked,
            audit_log_retention_days: Number(
                getElement<HTMLInputElement>("auditRetention").value
            )
        },
        permissions: {
            allow_staff_user_management:
                getElement<HTMLInputElement>("allowStaffUserManagement").checked,
            allow_staff_settings_access:
                getElement<HTMLInputElement>("allowStaffSettingsAccess").checked
        }
    };
}

async function loadSettings(): Promise<void> {
    try {
        const response = await fetch("/api/settings");
        const data: SettingsResponse = await response.json();
        if (!response.ok || !data.success || !data.config) {
            throw new Error(data.message || "Unable to load system settings.");
        }

        fillSettings(data.config);
        if (settingsLayout) settingsLayout.hidden = false;
        if (accessMessage) accessMessage.hidden = true;
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unable to load system settings.";
        showMessage(accessMessage, message, true);
    }
}

async function loadDatabaseStatus(): Promise<void> {
    const statusElement = document.getElementById("databaseStatus");
    const statusText = document.getElementById("databaseStatusText");
    const engineElement = document.getElementById("databaseEngine");
    const totalElement = document.getElementById("databasePoolTotal");
    const idleElement = document.getElementById("databasePoolIdle");
    const waitingElement = document.getElementById("databasePoolWaiting");
    const responseTimeElement = document.getElementById("databaseResponseTime");
    const checkedAtElement = document.getElementById("databaseCheckedAt");
    const passwordCheckerStatusElement = document.getElementById("passwordCheckerStatus");

    try {
        const response = await fetch("/api/settings/database-status");
        const data: DatabaseStatusResponse = await response.json();
        if (!data.database) {
            throw new Error(data.message || "Unable to retrieve database status.");
        }

        statusElement?.setAttribute("data-status", data.database.status);
        if (statusText) {
            statusText.textContent = data.database.status === "connected"
                ? "Connected"
                : "Disconnected";
        }
        if (engineElement) engineElement.textContent = data.database.engine;
        if (totalElement) {
            totalElement.textContent = String(data.database.pool?.total ?? "—");
        }
        if (idleElement) {
            idleElement.textContent = String(data.database.pool?.idle ?? "—");
        }
        if (waitingElement) {
            const waiting = data.database.pool?.waiting;
            waitingElement.textContent = String(waiting ?? "—");
            if (waiting === undefined) {
                waitingElement.removeAttribute("data-value");
            } else {
                waitingElement.setAttribute("data-value", String(waiting));
            }
        }
        if (responseTimeElement) {
            responseTimeElement.textContent = data.database.response_time_ms === undefined
                ? "—"
                : `${data.database.response_time_ms} ms`;
        }
        if (checkedAtElement) {
            const checkedAt = new Date(data.database.checked_at);
            checkedAtElement.textContent = Number.isNaN(checkedAt.getTime())
                ? "Unavailable"
                : checkedAt.toLocaleString();
        }
        if (passwordCheckerStatusElement && data.password_strength_checker) {
            const checkerStatus = data.password_strength_checker.status;
            passwordCheckerStatusElement.textContent =
                `${data.password_strength_checker.name} · ${checkerStatus === "available" ? "Available" : "Unavailable"}`;
            passwordCheckerStatusElement.setAttribute("data-status", checkerStatus);
        }
    } catch (error) {
        statusElement?.setAttribute("data-status", "disconnected");
        if (statusText) statusText.textContent = "Status unavailable";
        if (passwordCheckerStatusElement) {
            passwordCheckerStatusElement.textContent = "Status unavailable";
            passwordCheckerStatusElement.setAttribute("data-status", "unavailable");
        }
        const message = error instanceof Error
            ? error.message
            : "Unable to retrieve database status.";
        console.error(message, error);
    }
}

saveButton?.addEventListener("click", async () => {
    if (!saveButton) return;

    const requiredInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(".settings-field input[required]")
    );
    const invalidInput = requiredInputs.find((input) => !input.reportValidity());
    if (invalidInput) {
        invalidInput.focus();
        return;
    }

    saveButton.disabled = true;
    showMessage(saveMessage, "Saving system settings...");
    try {
        const response = await fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: readEditableSettings() })
        });
        const data: SettingsResponse = await response.json();
        if (!response.ok || !data.success || !data.config) {
            throw new Error(data.message || "Unable to save system settings.");
        }
        fillSettings(data.config);
        showMessage(saveMessage, data.message || "System settings saved.");
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unable to save system settings.";
        showMessage(saveMessage, message, true);
    } finally {
        saveButton.disabled = false;
    }
});

void loadSettings();
void loadDatabaseStatus();
