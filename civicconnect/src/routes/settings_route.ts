import { readFile, writeFile } from "node:fs/promises";
import { Router, type Request, type Response } from "express";
import zxcvbn from "ts-zxcvbn";
import { hasUserManagementAccess } from "../auth/user_session";
import { dbPool } from "../config/database";

const router = Router();
const configPath = new URL("../../public/site-config.json", import.meta.url);
const allowedRoles = ["Admin", "Manager", "Staff", "Citizen", "Contractor"];

interface SiteConfig {
    general: {
        site_name: string;
        site_description: string;
        default_language: string;
        default_timezone: string;
        date_format: string;
    };
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

type EditableSettings = Omit<SiteConfig, "general">;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function isSiteConfig(value: unknown): value is SiteConfig {
    if (!isRecord(value)) return false;

    const { general, security, users, audit, permissions } = value;
    return (
        isRecord(general) &&
        typeof general.site_name === "string" &&
        typeof general.site_description === "string" &&
        typeof general.default_language === "string" &&
        typeof general.default_timezone === "string" &&
        typeof general.date_format === "string" &&
        isRecord(security) &&
        typeof security.minimum_password_strength_level === "number" &&
        Number.isInteger(security.minimum_password_strength_level) &&
        security.minimum_password_strength_level >= 0 &&
        security.minimum_password_strength_level <= 4 &&
        isPositiveInteger(security.session_timeout_minutes) &&
        isPositiveInteger(security.max_login_attempts) &&
        isRecord(users) &&
        isBoolean(users.allow_user_registration) &&
        typeof users.default_user_role === "string" &&
        allowedRoles.includes(users.default_user_role) &&
        isBoolean(users.allow_profile_editing) &&
        isRecord(audit) &&
        isBoolean(audit.enable_audit_logging) &&
        isBoolean(audit.log_failed_login_attempts) &&
        isPositiveInteger(audit.audit_log_retention_days) &&
        isRecord(permissions) &&
        isBoolean(permissions.allow_staff_user_management) &&
        isBoolean(permissions.allow_staff_settings_access)
    );
}

function isEditableSettings(value: unknown): value is EditableSettings {
    if (!isRecord(value) || "general" in value) return false;
    return isSiteConfig({
        general: {
            site_name: "",
            site_description: "",
            default_language: "",
            default_timezone: "",
            date_format: ""
        },
        ...value
    });
}

async function readSiteConfig(): Promise<SiteConfig> {
    const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (!isSiteConfig(parsed)) {
        throw new Error("Site configuration is invalid.");
    }
    return parsed;
}

router.get("/", async (req: Request, res: Response) => {
    try {
        if (!(await hasUserManagementAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only Admins and Managers can access system settings."
            });
        }

        const config = await readSiteConfig();
        return res.status(200).json({ success: true, config });
    } catch (error) {
        console.error("Failed to load site configuration:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load system settings."
        });
    }
});

router.get("/public", async (_req: Request, res: Response) => {
    try {
        const config = await readSiteConfig();
        return res.status(200).json({
            security: {
                minimum_password_strength_level:
                    config.security.minimum_password_strength_level
            }
        });
    } catch (error) {
        console.error("Failed to load public site configuration:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load site configuration."
        });
    }
});

router.get("/database-status", async (req: Request, res: Response) => {
    let passwordCheckerStatus: "available" | "unavailable" = "unavailable";
    try {
        const probe = zxcvbn("CivicConnect password strength status check");
        if (Number.isInteger(probe.score) && probe.score >= 0 && probe.score <= 4) {
            passwordCheckerStatus = "available";
        }
    } catch (error) {
        console.error("Password strength checker status check failed:", error);
    }

    try {
        if (!(await hasUserManagementAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only Admins and Managers can view database status."
            });
        }

        const startedAt = performance.now();
        await dbPool.query("SELECT 1");
        const responseTimeMs = Math.round(performance.now() - startedAt);
        return res.status(200).json({
            success: true,
            database: {
                status: "connected",
                engine: "PostgreSQL",
                pool: {
                    total: dbPool.totalCount,
                    idle: dbPool.idleCount,
                    waiting: dbPool.waitingCount
                },
                response_time_ms: responseTimeMs,
                checked_at: new Date().toISOString()
            },
            password_strength_checker: {
                name: "ts-zxcvbn",
                status: passwordCheckerStatus
            }
        });
    } catch (error) {
        console.error("Database status check failed:", error);
        return res.status(503).json({
            success: false,
            message: "Database connection is unavailable.",
            database: {
                status: "disconnected",
                engine: "PostgreSQL",
                checked_at: new Date().toISOString()
            },
            password_strength_checker: {
                name: "ts-zxcvbn",
                status: passwordCheckerStatus
            }
        });
    }
});

router.put("/", async (req: Request, res: Response) => {
    try {
        if (!(await hasUserManagementAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only Admins and Managers can update system settings."
            });
        }
        if (!isEditableSettings(req.body?.config)) {
            return res.status(400).json({
                success: false,
                message: "One or more system settings are invalid."
            });
        }

        const currentConfig = await readSiteConfig();
        const updatedConfig: SiteConfig = {
            general: currentConfig.general,
            security: req.body.config.security,
            users: req.body.config.users,
            audit: req.body.config.audit,
            permissions: req.body.config.permissions
        };
        await writeFile(configPath, `${JSON.stringify(updatedConfig, null, 2)}\n`, "utf8");

        return res.status(200).json({
            success: true,
            message: "System settings saved.",
            config: updatedConfig
        });
    } catch (error) {
        console.error("Failed to update site configuration:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save system settings."
        });
    }
});

export default router;
