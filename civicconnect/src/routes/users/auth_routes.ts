import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import bcrypt from "bcrypt";
import { dbPool } from "../../config/database";
import { clearUserSession, setUserSession } from "../../auth/user_session";
import { getUserTableSchema, type User } from "./shared";

const router = Router();

router.post("/logout", (_req: Request, res: Response) => {
    clearUserSession(res);
    return res.status(200).json({
        success: true,
        message: "You have been signed out."
    });
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
            ? await dbPool.query<{ user_id: number }>(
                `
                INSERT INTO "User" (full_name, full_surname, account_status, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id
                `,
                [normalizedFirstName, normalizedLastName, activeStatus, normalizedEmail, passwordHash]
            )
            : await dbPool.query<{ user_id: number }>(
                `
                INSERT INTO "User" (full_name, account_status, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id
                `,
                [fullName, activeStatus, normalizedEmail, passwordHash]
            );

        if (result.rows.length === 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Registration successful."
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
        const result = await dbPool.query<Pick<User, "user_id" | "password_hash" | "role">>(
            `
            SELECT
                user_id,
                ${schema.passwordColumn} AS password_hash,
                role
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

        await setUserSession(res, user.user_id, user.role);

        // Successful login
        return res.status(200).json({
            success: true,
            message: "Login successful."
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred."
        });
    }
});

export default router;
