
import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import bcrypt from "bcrypt";
import zxcvbn from "ts-zxcvbn";
import { readFile } from "node:fs/promises";
import { dbPool } from "../config/database";
import {
    getSessionUserId,
    hasUserManagementAccess,
    setUserSession
} from "../auth/user_session";

const router = Router();

interface User {
    user_id: number;
    full_name: string;
    full_surname?: string;
    account_status: boolean | string;
    email: string;
    role: string;
    password_hash: string;
}

interface UserTableSchema {
    hasSurname: boolean;
    accountStatusIsBoolean: boolean;
    passwordColumn: "password" | "password_hash";
}

async function getUserTableSchema(): Promise<UserTableSchema> {
    const result = await dbPool.query<{ column_name: string; data_type: string }>(
        `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'User'
        `
    );
    const columns = new Map(result.rows.map((row) => [row.column_name, row.data_type]));
    const passwordColumn = columns.has("password_hash")
        ? "password_hash"
        : columns.has("password")
            ? "password"
            : null;

    if (
        !columns.has("full_name") ||
        !columns.has("email") ||
        !columns.has("account_status") ||
        !passwordColumn
    ) {
        throw new Error('The "User" table does not have a supported authentication schema.');
    }

    return {
        hasSurname: columns.has("full_surname"),
        accountStatusIsBoolean: columns.get("account_status") === "boolean",
        passwordColumn
    };
}

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
                canManageUsers: user.role === "Admin" || user.role === "Manager"
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
                await readFile(new URL("../../public/site-config.json", import.meta.url), "utf8")
            );
            if (
                typeof siteConfig !== "object" ||
                siteConfig === null ||
                !("minimum_password_strength_level" in siteConfig) ||
                typeof siteConfig.minimum_password_strength_level !== "number" ||
                !Number.isInteger(siteConfig.minimum_password_strength_level) ||
                siteConfig.minimum_password_strength_level < 0 ||
                siteConfig.minimum_password_strength_level > 4
            ) {
                throw new Error("Password strength configuration is invalid.");
            }

            if (zxcvbn(new_password).score < siteConfig.minimum_password_strength_level) {
                return res.status(400).json({
                    success: false,
                    message: `Choose a stronger password. It must meet strength level ${siteConfig.minimum_password_strength_level}.`
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

// POST /api/users/register
router.post("/register", async (req: Request, res: Response) => {
    try {
        const { firstName, lastName, email, password } = req.body ?? {};

        if (
            typeof firstName !== "string" ||
            typeof lastName !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, email, and password are required."
            });
        }

        const normalizedFirstName = firstName.trim();
        const normalizedLastName = lastName.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const fullName = `${normalizedFirstName} ${normalizedLastName}`;

        if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !password) {
            return res.status(400).json({
                success: false,
                message: "First name, last name, email, and password are required."
            });
        }

        if (fullName.length > 100 || normalizedEmail.length > 150) {
            return res.status(400).json({
                success: false,
                message: "Name or email exceeds the maximum allowed length."
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }

        const passwordBytes = Buffer.byteLength(password, "utf8");
        if (password.length < 8 || passwordBytes > 72) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters and no more than 72 bytes."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const schema = await getUserTableSchema();
        const activeStatus: boolean | string = schema.accountStatusIsBoolean
            ? true
            : "active";
        const result = schema.hasSurname
            ? await dbPool.query<Omit<User, "password_hash">>(
                `
                INSERT INTO "User" (full_name, full_surname, account_status, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id, full_name, full_surname, account_status, email, role
                `,
                [normalizedFirstName, normalizedLastName, activeStatus, normalizedEmail, passwordHash]
            )
            : await dbPool.query<Omit<User, "password_hash">>(
                `
                INSERT INTO "User" (full_name, account_status, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id, full_name, account_status, email, role
                `,
                [fullName, activeStatus, normalizedEmail, passwordHash]
            );

        if (result.rows.length === 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const user = result.rows[0];
        return res.status(201).json({
            success: true,
            message: "Registration successful.",
            user: {
                user_id: user.user_id,
                full_name: fullName,
                account_status: user.account_status,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred."
        });
    }
});

//-------------------------------------------------------------------
// POST /api/users/login
//-------------------------------------------------------------------
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body ?? {};

        // Validate request
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        // Find the user in Supabase PostgreSQL
        const schema = await getUserTableSchema();
        const surnameSelection = schema.hasSurname
            ? "full_surname"
            : "NULL::text AS full_surname";
        const result = await dbPool.query<User>(
            `
            SELECT
                user_id,
                full_name,
                ${surnameSelection},
                account_status,
                email,
                role,
                ${schema.passwordColumn} AS password_hash
            FROM "User"
            WHERE LOWER(email) = LOWER($1)
              AND LOWER(account_status::text) IN ('active', 'true')
            LIMIT 1
            `,
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        // Compare plaintext password with bcrypt hash
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        setUserSession(res, user.user_id);

        // Successful login
        return res.status(200).json({
            success: true,
            message: "Login successful.",
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                full_surname: user.full_surname,
                account_status: user.account_status,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred."
        });
    }
});

// PATCH /api/users/:id
router.patch("/:id", async (req: Request, res: Response) => {
    try {
        if (!(await hasUserManagementAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only active Admin or Manager accounts can edit users."
            });
        }

        const userId = Number(req.params.id);
        const { full_name, full_surname, email, role, account_status } = req.body ?? {};
        if (!Number.isSafeInteger(userId) || userId < 1) {
            return res.status(400).json({
                success: false,
                message: "A valid user ID is required."
            });
        }

        if (
            typeof full_name !== "string" ||
            typeof full_surname !== "string" ||
            typeof email !== "string" ||
            typeof role !== "string" ||
            typeof account_status !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, surname, email, role, and account status are required."
            });
        }

        const normalizedName = full_name.trim();
        const normalizedSurname = full_surname.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const allowedRoles = ["Admin", "Manager", "Staff", "Citizen", "Contractor"];

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
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Select a valid user role."
            });
        }

        const schema = await getUserTableSchema();
        const statusValue: boolean | string = schema.accountStatusIsBoolean
            ? account_status
            : account_status ? "active" : "inactive";
        const result = schema.hasSurname
            ? await dbPool.query<Omit<User, "password_hash">>(
                `
                UPDATE "User"
                SET full_name = $1,
                    full_surname = $2,
                    email = $3,
                    role = $4,
                    account_status = $5
                WHERE user_id = $6
                RETURNING user_id, full_name, full_surname, account_status, email, role
                `,
                [normalizedName, normalizedSurname, normalizedEmail, role, statusValue, userId]
            )
            : await dbPool.query<Omit<User, "password_hash">>(
                `
                UPDATE "User"
                SET full_name = $1,
                    email = $2,
                    role = $3,
                    account_status = $4
                WHERE user_id = $5
                RETURNING user_id, full_name, NULL::text AS full_surname, account_status, email, role
                `,
                [normalizedName, normalizedEmail, role, statusValue, userId]
            );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.status(200).json({
            success: true,
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

        console.error("User update error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update user."
        });
    }
});

export default router;
