import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Request, Response } from "express";
import { dbPool } from "../config/database";

const cookieName = "civicconnect_session";
const configPath = new URL("../../public/site-config.json", import.meta.url);
const configuredSecret = process.env.SESSION_SECRET;

if (!configuredSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production.");
}
if (
    configuredSecret &&
    Buffer.byteLength(configuredSecret, "utf8") < 32 &&
    process.env.NODE_ENV === "production"
) {
    throw new Error("SESSION_SECRET must be at least 32 bytes in production.");
}

const sessionSecret = configuredSecret ?? randomBytes(32).toString("hex");
if (!configuredSecret) {
    console.warn("SESSION_SECRET is not set; login sessions will be invalidated when the server restarts.");
}

interface SessionPayload {
    userId: number;
    role: string;
    expiresAt: number;
}

function sign(payload: string): Buffer {
    return createHmac("sha256", sessionSecret).update(payload).digest();
}

async function getSessionLifetimeSeconds(): Promise<number> {
    const config: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (
        typeof config !== "object" ||
        config === null ||
        !("security" in config) ||
        typeof config.security !== "object" ||
        config.security === null ||
        !("session_timeout_minutes" in config.security) ||
        typeof config.security.session_timeout_minutes !== "number" ||
        !Number.isSafeInteger(config.security.session_timeout_minutes) ||
        config.security.session_timeout_minutes <= 0
    ) {
        throw new Error("Session timeout configuration is invalid.");
    }

    const lifetimeSeconds = config.security.session_timeout_minutes * 60;
    if (!Number.isSafeInteger(lifetimeSeconds)) {
        throw new Error("Session timeout configuration is too large.");
    }
    return lifetimeSeconds;
}

export async function setUserSession(
    res: Response,
    userId: number,
    role: string
): Promise<void> {
    const sessionLifetimeSeconds = await getSessionLifetimeSeconds();
    const payload = Buffer.from(
        JSON.stringify({
            userId,
            role,
            expiresAt: Date.now() + sessionLifetimeSeconds * 1000
        } satisfies SessionPayload)
    ).toString("base64url");
    const signature = sign(payload).toString("base64url");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    res.setHeader(
        "Set-Cookie",
        `${cookieName}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeSeconds}${secure}`
    );
}

export function clearUserSession(res: Response): void {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    );
}

export function getSessionUserId(req: Request): number | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
        return null;
    }

    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));
    if (!cookie) {
        return null;
    }

    const token = cookie.slice(cookieName.length + 1);
    const separator = token.lastIndexOf(".");
    if (separator < 1) {
        return null;
    }

    const payload = token.slice(0, separator);
    const providedSignature = Buffer.from(token.slice(separator + 1), "base64url");
    const expectedSignature = sign(payload);
    if (
        providedSignature.length !== expectedSignature.length ||
        !timingSafeEqual(providedSignature, expectedSignature)
    ) {
        return null;
    }

    try {
        const session = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        ) as Partial<SessionPayload>;
        if (
            typeof session.userId !== "number" ||
            !Number.isSafeInteger(session.userId) ||
            session.userId < 0 ||
            typeof session.expiresAt !== "number" ||
            session.expiresAt <= Date.now()
        ) {
            return null;
        }

        return session.userId;
    } catch {
        return null;
    }
}

export async function hasUserManagementAccess(req: Request): Promise<boolean> {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return false;
    }

    const result = await dbPool.query<{
        role: string;
        account_status: boolean | string;
    }>(
        `
        SELECT role, account_status
        FROM "User"
        WHERE user_id = $1
        `,
        [userId]
    );
    const user = result.rows[0];

    if (!user) {
        return false;
    }

    const isActive = user.account_status === true ||
        String(user.account_status).toLowerCase() === "active" ||
        String(user.account_status).toLowerCase() === "true";

    return isActive && (user.role === "Admin" || user.role === "Manager");
}

export async function hasAuditLogAccess(req: Request): Promise<boolean> {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return false;
    }

    const result = await dbPool.query<{
        role: string;
        account_status: boolean | string;
    }>(
        `
        SELECT role, account_status
        FROM "User"
        WHERE user_id = $1
        `,
        [userId]
    );
    const user = result.rows[0];

    if (!user) {
        return false;
    }

    const isActive = user.account_status === true ||
        String(user.account_status).toLowerCase() === "active" ||
        String(user.account_status).toLowerCase() === "true";

    return isActive && ["Staff", "Manager", "Admin"].includes(user.role);
}
