import { Router } from "express";
import type { Request } from "express";
import type { Response } from "express";
import { dbPool } from "../../config/database";
import { hasUserManagementAccess } from "../../auth/user_session";
import { getUserTableSchema, type User } from "./shared";

const router = Router();

// GET /api/users
router.get("/", async (req: Request, res: Response) => {
    try {
        if (!(await hasUserManagementAccess(req))) {
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

        const result = await dbPool.query<{
            user_id: number;
            full_name: string;
            full_surname: string | null;
            account_status: boolean | string;
            email: string;
            role: string;
        }>(`
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
