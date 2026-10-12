import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { dbPool } from "../config/database";

const cookieName = "civicconnect_session";
const sessionLifetimeSeconds = 8 * 60 * 60;
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
    expiresAt: number;
}

function sign(payload: string): Buffer {
    return createHmac("sha256", sessionSecret).update(payload).digest();
}

export function setUserSession(res: Response, userId: number): void {
    const payload = Buffer.from(
        JSON.stringify({
            userId,
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
