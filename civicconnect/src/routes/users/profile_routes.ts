import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import bcrypt from "bcrypt";
import zxcvbn from "ts-zxcvbn";
import { readFile } from "node:fs/promises";
import { dbPool } from "../../config/database";
import { getSessionUserId } from "../../auth/user_session";
import { getUserTableSchema, type User } from "./shared";

const router = Router();

// GET /api/users/me
router.get("/me", async (req: Request, res: Response) => {
    try {
        const userId = getSessionUserId(req);
        if (userId === null) {
            return res.status(401).json({
                success: false,
                message: "Sign in to view your account."
            });
        }

        const schema = await getUserTableSchema();
        const surnameSelection = schema.hasSurname
            ? "full_surname"
            : "NULL::text AS full_surname";
        const result = await dbPool.query<{
            full_name: string;
            full_surname: string | null;
            email: string;
            account_status: boolean | string;
            role: string;
        }>(
            `
            SELECT full_name, ${surnameSelection}, email, account_status, role
            FROM "User"
            WHERE user_id = $1
            `,
            [userId]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Your account could not be found. Sign in again."
            });
        }

        const isActive = user.account_status === true ||
            String(user.account_status).toLowerCase() === "active" ||
            String(user.account_status).toLowerCase() === "true";
        if (!isActive) {
            return res.status(401).json({
                success: false,
                message: "Your account is inactive. Sign in again."
            });
        }

        return res.status(200).json({
            success: true,
            user: {
                full_name: user.full_name,
                full_surname: user.full_surname,
                email: user.email,
                role: user.role,
                canManageUsers: user.role === "Admin" || user.role === "Manager",
                canViewContractorDashboard:
                    user.role === "Contractor" || user.role === "Admin",
                canViewAuditLogs:
                    user.role === "Staff" || user.role === "Manager" || user.role === "Admin"
            }
        });
    } catch (error) {
        console.error("Current user lookup error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve the signed-in user."
        });
    }
});

// PATCH /api/users/me
router.patch("/me", async (req: Request, res: Response) => {
    try {
        const userId = getSessionUserId(req);
        if (userId === null) {
            return res.status(401).json({
                success: false,
                message: "Sign in to update your account."
            });
        }

        const {
            full_name,
            full_surname,
            email,
            current_password,
            new_password,
            confirm_password
        } = req.body ?? {};
        if (
            typeof full_name !== "string" ||
            typeof full_surname !== "string" ||
            typeof email !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, surname, and email are required."
            });
        }

        const normalizedName = full_name.trim();
        const normalizedSurname = full_surname.trim();
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedName || normalizedName.length > 100 || normalizedSurname.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Name is required and names must be no longer than 100 characters."
            });
        }
        if (
            normalizedEmail.length > 150 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address no longer than 150 characters."
            });
        }

        const passwordChangeRequested =
            current_password !== undefined ||
            new_password !== undefined ||
            confirm_password !== undefined;
        if (
            passwordChangeRequested &&
            (
                typeof current_password !== "string" ||
                typeof new_password !== "string" ||
                typeof confirm_password !== "string" ||
                !current_password ||
                !new_password ||
                !confirm_password
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your current password, new password, and confirmation to change your password."
            });
        }

        const schema = await getUserTableSchema();
        const userResult = await dbPool.query<User>(
            `
            SELECT ${schema.passwordColumn} AS password_hash, account_status
            FROM "User"
            WHERE user_id = $1
            `,
            [userId]
        );
        const user = userResult.rows[0];
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Your account could not be found. Sign in again."
            });
        }
        const isActive = user.account_status === true ||
            String(user.account_status).toLowerCase() === "active" ||
            String(user.account_status).toLowerCase() === "true";
        if (!isActive) {
            return res.status(403).json({
                success: false,
                message: "Inactive accounts cannot update account details."
            });
        }

        let passwordHash: string | null = null;
        if (passwordChangeRequested) {
            if (
                typeof current_password !== "string" ||
                typeof new_password !== "string" ||
                typeof confirm_password !== "string"
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Enter your current password, new password, and confirmation to change your password."
                });
            }

            if (new_password !== confirm_password) {
                return res.status(400).json({
                    success: false,
                    message: "New password and confirmation do not match."
                });
            }

            const currentPasswordMatches = await bcrypt.compare(current_password, user.password_hash);
            if (!currentPasswordMatches) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect."
                });
            }

            const passwordBytes = Buffer.byteLength(new_password, "utf8");
            if (new_password.length < 8 || passwordBytes > 72) {
                return res.status(400).json({
                    success: false,
                    message: "New password must be at least 8 characters and no more than 72 bytes."
                });
            }

            const siteConfig: unknown = JSON.parse(
                await readFile(new URL("../../../public/site-config.json", import.meta.url), "utf8")
            );
            if (
                typeof siteConfig !== "object" ||
                siteConfig === null ||
                !("security" in siteConfig) ||
                typeof siteConfig.security !== "object" ||
                siteConfig.security === null ||
                !("minimum_password_strength_level" in siteConfig.security) ||
                typeof siteConfig.security.minimum_password_strength_level !== "number" ||
                !Number.isInteger(siteConfig.security.minimum_password_strength_level) ||
                siteConfig.security.minimum_password_strength_level < 0 ||
                siteConfig.security.minimum_password_strength_level > 4
            ) {
                throw new Error("Password strength configuration is invalid.");
            }

            const minimumStrength = siteConfig.security.minimum_password_strength_level;
            if (zxcvbn(new_password).score < minimumStrength) {
                return res.status(400).json({
                    success: false,
                    message: `Choose a stronger password. It must meet strength level ${minimumStrength}.`
                });
            }

            passwordHash = await bcrypt.hash(new_password, 12);
        }

        const assignments = ["full_name = $1", "email = $2"];
        const values: Array<string | number> = [normalizedName, normalizedEmail];
        let nextParameter = 3;
        if (schema.hasSurname) {
            assignments.push(`full_surname = $${nextParameter}`);
            values.push(normalizedSurname);
            nextParameter += 1;
        }
        if (passwordHash) {
            assignments.push(`${schema.passwordColumn} = $${nextParameter}`);
            values.push(passwordHash);
            nextParameter += 1;
        }
        values.push(userId);

        const result = await dbPool.query<{
            full_name: string;
            full_surname: string | null;
            email: string;
        }>(
            `
            UPDATE "User"
            SET ${assignments.join(", ")}
            WHERE user_id = $${nextParameter}
            RETURNING full_name, ${
                schema.hasSurname ? "full_surname" : "NULL::text AS full_surname"
            }, email
            `,
            values
        );

        return res.status(200).json({
            success: true,
            message: passwordHash
                ? "Account details and password updated successfully."
                : "Account details updated successfully.",
            user: result.rows[0]
        });
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
        ) {
            return res.status(409).json({
                success: false,
                message: "Another account already uses that email address."
            });
        }

        console.error("Account update error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update account details."
        });
    }
});

export default router;
