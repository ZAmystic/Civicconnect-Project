import { Router } from "express";
import type { Request, Response } from "express";
import { dbPool } from "../config/database";
import { hasUserManagementAccess } from "../auth/user_session";

const router = Router();

interface User {
    user_id: number;
    full_name: string;
    full_surname?: string | null;
    account_status: boolean | string;
    email: string;
    role: string;
}

// GET /api/users
router.get("/", async (_req: Request, res: Response) => {
    try {
        if (!(await hasUserManagementAccess(_req))) {
            return res.status(403).json({
                success: false,
                message: "Only active Admin or Manager accounts can view users."
            });
        }

        const columnsResult = await dbPool.query<{ column_name: string }>(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'User'
        `);
        const columns = new Set(columnsResult.rows.map((row) => row.column_name));
        const surnameSelection = columns.has("full_surname")
            ? "full_surname"
            : "NULL::text AS full_surname";

        const result = await dbPool.query<User>(`
            SELECT
                user_id,
                full_name,
                ${surnameSelection},
                account_status,
                email,
                role
            FROM "User"
            ORDER BY user_id ASC
        `);

        return res.status(200).json({
            success: true,
            users: result.rows,
            total: result.rowCount
        });

    } catch (error) {
        console.error("Error fetching users:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve users."
        });
    }
});

export default router;
