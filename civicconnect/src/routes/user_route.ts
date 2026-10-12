
import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import bcrypt from "bcrypt";
import { dbPool } from "../config/database";

const router = Router();

interface User {
    user_id: number;
    full_name: string;
    full_surname?: string;
    email: string;
    role: string;
    password_hash: string;
}

interface UserTableSchema {
    hasSurname: boolean;
    passwordColumn: "password" | "password_hash";
}

async function getUserTableSchema(): Promise<UserTableSchema> {
    const result = await dbPool.query<{ column_name: string }>(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'User'
        `
    );
    const columns = new Set(result.rows.map((row) => row.column_name));
    const passwordColumn = columns.has("password_hash")
        ? "password_hash"
        : columns.has("password")
            ? "password"
            : null;

    if (!columns.has("full_name") || !columns.has("email") || !passwordColumn) {
        throw new Error('The "User" table does not have a supported authentication schema.');
    }

    return {
        hasSurname: columns.has("full_surname"),
        passwordColumn
    };
}

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
        const result = schema.hasSurname
            ? await dbPool.query<Omit<User, "password_hash">>(
                `
                INSERT INTO "User" (full_name, full_surname, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id, full_name, full_surname, email, role
                `,
                [normalizedFirstName, normalizedLastName, normalizedEmail, passwordHash]
            )
            : await dbPool.query<Omit<User, "password_hash">>(
                `
                INSERT INTO "User" (full_name, email, ${schema.passwordColumn})
                VALUES ($1, $2, $3)
                ON CONFLICT (email) DO NOTHING
                RETURNING user_id, full_name, email, role
                `,
                [fullName, normalizedEmail, passwordHash]
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
                email,
                role,
                ${schema.passwordColumn} AS password_hash
            FROM "User"
            WHERE LOWER(email) = LOWER($1)
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

        // Successful login
        return res.status(200).json({
            success: true,
            message: "Login successful.",
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                full_surname: user.full_surname,
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

export default router;
