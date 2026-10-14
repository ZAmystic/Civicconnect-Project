import { Router, type Request, type Response } from "express";
import { hasAuditLogAccess } from "../auth/user_session";
import { dbPool } from "../config/database";

const router = Router();
const allowedStatuses = [
    "Submitted",
    "Assigned",
    "In_Progress",
    "Resolved",
    "Closed",
    "Rejected",
    "Cancelled"
] as const;
const pageSize = 25;
const maximumPage = 100_000;

interface AuditLogRow {
    log_id: string;
    ticket_id: string;
    tracking_ref: string;
    actor_name: string;
    actor_role: string;
    previous_status: string | null;
    new_status: string;
    change_reason: string;
    timestamp: Date | string;
}

function parsePage(value: unknown): number | null {
    if (value === undefined) {
        return 1;
    }
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        return null;
    }
    const page = Number(value);
    return Number.isSafeInteger(page) && page <= maximumPage ? page : null;
}

router.get("/", async (req: Request, res: Response) => {
    try {
        if (!(await hasAuditLogAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only active Staff, Managers, and Admins can view audit logs."
            });
        }

        const requestedPage = parsePage(req.query.page);
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const status = typeof req.query.status === "string" ? req.query.status : "";
        if (
            requestedPage === null ||
            (req.query.search !== undefined &&
                (typeof req.query.search !== "string" || search.length > 100)) ||
            (status && !allowedStatuses.some((allowedStatus) => allowedStatus === status))
        ) {
            return res.status(400).json({
                success: false,
                message: "The audit log filters are invalid."
            });
        }

        const conditions: string[] = [];
        const values: string[] = [];
        if (search) {
            values.push(`%${search}%`);
            const searchParameter = `$${values.length}`;
            conditions.push(`(
                audit.tracking_ref ILIKE ${searchParameter}
                OR actor.full_name ILIKE ${searchParameter}
                OR COALESCE(actor.full_surname, '') ILIKE ${searchParameter}
                OR actor.role ILIKE ${searchParameter}
                OR audit.change_reason ILIKE ${searchParameter}
                OR audit.previous_status ILIKE ${searchParameter}
                OR audit.new_status ILIKE ${searchParameter}
            )`);
        }
        if (status) {
            values.push(status);
            conditions.push(`audit.new_status = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const countResult = await dbPool.query<{ total: string }>(
            `
            SELECT COUNT(*)::text AS total
            FROM "AuditLog" AS audit
            INNER JOIN "Ticket" AS ticket ON ticket.ticket_id = audit.ticket_id
            INNER JOIN "User" AS actor ON actor.user_id = audit.actor_id
            ${whereClause}
            `,
            values
        );

        const total = Number(countResult.rows[0]?.total ?? "0");
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(requestedPage, Math.max(totalPages, 1));
        const offset = (page - 1) * pageSize;
        const resultValues = [...values, pageSize, offset];
        const result = await dbPool.query<AuditLogRow>(
            `
            SELECT
                audit.log_id::text,
                audit.ticket_id::text,
                ticket.tracking_ref,
                CONCAT_WS(' ', actor.full_name, actor.full_surname) AS actor_name,
                actor.role AS actor_role,
                audit.previous_status,
                audit.new_status,
                audit.change_reason,
                audit.timestamp
            FROM "AuditLog" AS audit
            INNER JOIN "Ticket" AS ticket ON ticket.ticket_id = audit.ticket_id
            INNER JOIN "User" AS actor ON actor.user_id = audit.actor_id
            ${whereClause}
            ORDER BY audit.timestamp DESC, audit.log_id DESC
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
            `,
            resultValues
        );

        return res.status(200).json({
            success: true,
            logs: result.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages
            }
        });
    } catch (error) {
        console.error("Failed to retrieve audit logs:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve audit logs."
        });
    }
});

export default router;
