
import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import bcrypt from "bcrypt";
import { dbPool } from "../config/database";

const router = Router();

interface User {
    user_id: number;
    full_name: string;
    full_surname: string;
    email: string;
    role: string;
    password: string;
}

// POST /api/users/login
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
        const result = await dbPool.query<User>(
            `
            SELECT
                user_id,
                full_name,
                full_surname,
                email,
                role,
                password
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
            user.password
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
