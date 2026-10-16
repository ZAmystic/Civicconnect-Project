import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import {
    getSessionUserId,
    hasAuditLogAccess,
    hasAdminAccess,
    hasContractorAccess
} from "../auth/user_session";
import { dbPool } from "../config/database";
import { sendTicketChangeNotification } from "../services/ticket_notifications";

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

interface TicketRow {
    ticket_id: string;
    tracking_ref: string;
    requester_name: string;
    category_name: string;
    description: string;
    status: string;
    created_at: Date | string;
    contractor_user_id: number | null;
    contractor_name: string | null;
}

interface ContractorRow {
    user_id: number;
    full_name: string;
    email?: string | null;
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
                message: "Only active Staff, Managers, and Admins can view all tickets."
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
                message: "The ticket filters are invalid."
            });
        }

        const conditions: string[] = [];
        const values: string[] = [];
        if (search) {
            values.push(`%${search}%`);
            const searchParameter = `$${values.length}`;
            conditions.push(`(
                ticket.tracking_ref ILIKE ${searchParameter}
                OR ticket.description ILIKE ${searchParameter}
                OR category.category_name ILIKE ${searchParameter}
                OR requester.full_name ILIKE ${searchParameter}
                OR COALESCE(requester.full_surname, '') ILIKE ${searchParameter}
            )`);
        }
        if (status) {
            values.push(status);
            conditions.push(`ticket.status = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const fromClause = `
            FROM "Ticket" AS ticket
            INNER JOIN "ServiceCategory" AS category
                ON category.category_id = ticket.category_id
            INNER JOIN "User" AS requester
                ON requester.user_id = ticket.citizen_id
            LEFT JOIN LATERAL (
                SELECT contractor_user_id
                FROM "ContractorAssignment"
                WHERE ticket_id = ticket.ticket_id
                ORDER BY assigned_at DESC, assignment_id DESC
                LIMIT 1
            ) AS assignment ON TRUE
            LEFT JOIN "User" AS contractor
                ON contractor.user_id = assignment.contractor_user_id
        `;

        const countResult = await dbPool.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total ${fromClause} ${whereClause}`,
            values
        );
        const total = Number(countResult.rows[0]?.total ?? "0");
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(requestedPage, Math.max(totalPages, 1));
        const result = await dbPool.query<TicketRow>(
            `
            SELECT
                ticket.ticket_id::text,
                ticket.tracking_ref,
                CONCAT_WS(' ', requester.full_name, requester.full_surname) AS requester_name,
                category.category_name,
                ticket.description,
                ticket.status,
                ticket.created_at,
                assignment.contractor_user_id,
                CONCAT_WS(' ', contractor.full_name, contractor.full_surname) AS contractor_name
            ${fromClause}
            ${whereClause}
            ORDER BY ticket.created_at DESC, ticket.ticket_id DESC
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
            `,
            [...values, pageSize, (page - 1) * pageSize]
        );

        return res.status(200).json({
            success: true,
            tickets: result.rows,
            pagination: {
                page,
                pageSize,
                total,
                totalPages
            }
        });
    } catch (error) {
        console.error("Failed to retrieve tickets:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve tickets."
        });
    }
});

router.get("/contractors", async (req: Request, res: Response) => {
    try {
        if (!(await hasAuditLogAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only active Staff, Managers, and Admins can view contractors."
            });
        }

        const result = await dbPool.query<ContractorRow>(`
            SELECT user_id, CONCAT_WS(' ', full_name, full_surname) AS full_name
            FROM "User"
            WHERE role = 'Contractor'
              AND LOWER(account_status::text) IN ('active', 'true')
            ORDER BY full_name, full_surname, user_id
        `);
        return res.status(200).json({ success: true, contractors: result.rows });
    } catch (error) {
        console.error("Failed to retrieve contractors:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve contractors."
        });
    }
});

router.get("/assigned", async (req: Request, res: Response) => {
    try {
        const contractorId = getSessionUserId(req);
        const isContractor = contractorId !== null && await hasContractorAccess(req);
        const isAdmin = !isContractor && await hasAdminAccess(req);
        if (!isContractor && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Only active Contractors and Admins can view the contractor dashboard."
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
                message: "The ticket filters are invalid."
            });
        }

        const conditions = ["assignment.completion_status NOT IN ('Completed', 'Failed')"];
        const values: (number | string)[] = [];
        if (isContractor) {
            values.push(contractorId!);
            conditions.unshift(`assignment.contractor_user_id = $${values.length}`);
        }
        if (search) {
            values.push(`%${search}%`);
            const searchParameter = `$${values.length}`;
            conditions.push(`(
                ticket.tracking_ref ILIKE ${searchParameter}
                OR ticket.description ILIKE ${searchParameter}
                OR category.category_name ILIKE ${searchParameter}
                OR requester.full_name ILIKE ${searchParameter}
                OR COALESCE(requester.full_surname, '') ILIKE ${searchParameter}
            )`);
        }
        if (status) {
            values.push(status);
            conditions.push(`ticket.status = $${values.length}`);
        }
        const whereClause = `WHERE ${conditions.join(" AND ")}`;
        const fromClause = `
            FROM "Ticket" AS ticket
            INNER JOIN "ServiceCategory" AS category
                ON category.category_id = ticket.category_id
            INNER JOIN "User" AS requester
                ON requester.user_id = ticket.citizen_id
            INNER JOIN LATERAL (
                SELECT
                    assignment.contractor_user_id,
                    assignment.completion_status,
                    CONCAT_WS(' ', contractor.full_name, contractor.full_surname) AS contractor_name
                FROM "ContractorAssignment" AS assignment
                INNER JOIN "User" AS contractor
                    ON contractor.user_id = assignment.contractor_user_id
                WHERE assignment.ticket_id = ticket.ticket_id
                ORDER BY assignment.assigned_at DESC, assignment.assignment_id DESC
                LIMIT 1
            ) AS assignment ON TRUE
        `;
        const countResult = await dbPool.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total ${fromClause} ${whereClause}`,
            values
        );
        const total = Number(countResult.rows[0]?.total ?? "0");
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(requestedPage, Math.max(totalPages, 1));
        const result = await dbPool.query<TicketRow>(
            `
            SELECT
                ticket.ticket_id::text,
                ticket.tracking_ref,
                CONCAT_WS(' ', requester.full_name, requester.full_surname) AS requester_name,
                category.category_name,
                ticket.description,
                ticket.status,
                ticket.created_at,
                assignment.contractor_user_id,
                assignment.contractor_name
            ${fromClause}
            ${whereClause}
            ORDER BY ticket.created_at DESC, ticket.ticket_id DESC
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
            `,
            [...values, pageSize, (page - 1) * pageSize]
        );
        return res.status(200).json({
            success: true,
            viewMode: isAdmin ? "admin" : "contractor",
            tickets: result.rows,
            pagination: { page, pageSize, total, totalPages }
        });
    } catch (error) {
        console.error("Failed to retrieve contractor tickets:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve assigned tickets."
        });
    }
});

router.patch("/:ticketId/status", async (req: Request, res: Response) => {
    let client: PoolClient | undefined;
    try {
        const actorId = getSessionUserId(req);
        const canManageAllTickets = await hasAuditLogAccess(req);
        const isContractor = !canManageAllTickets && await hasContractorAccess(req);
        if (actorId === null || (!canManageAllTickets && !isContractor)) {
            return res.status(403).json({
                success: false,
                message: "Only active Staff, Managers, Admins, and assigned Contractors can change ticket status."
            });
        }

        const ticketId = req.params.ticketId;
        const { status, reason, contractorId } = req.body ?? {};
        const normalizedReason = typeof reason === "string" ? reason.trim() : "";
        const normalizedContractorId = contractorId === undefined || contractorId === null
            ? null
            : Number(contractorId);
        if (
            typeof ticketId !== "string" ||
            !/^[1-9]\d*$/.test(ticketId) ||
            typeof status !== "string" ||
            !allowedStatuses.some((allowedStatus) => allowedStatus === status) ||
            (normalizedReason.length > 255) ||
            (isContractor && normalizedContractorId !== null) ||
            (contractorId !== undefined &&
                contractorId !== null &&
                (!Number.isSafeInteger(normalizedContractorId) || normalizedContractorId! < 1))
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid status, contractor, and reason no longer than 255 characters."
            });
        }

        client = await dbPool.connect();
        await client.query("BEGIN");
        const ticketResult = await client.query<{
            status: string;
            tracking_ref: string;
            requester_email: string | null;
        }>(
            `
            SELECT ticket.status, ticket.tracking_ref, requester.email AS requester_email
            FROM "Ticket" AS ticket
            INNER JOIN "User" AS requester ON requester.user_id = ticket.citizen_id
            WHERE ticket.ticket_id = $1
            FOR UPDATE OF ticket
            `,
            [ticketId]
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "The requested ticket could not be found."
            });
        }

        if (isContractor) {
            const assignmentResult = await client.query<{
                contractor_user_id: number;
                completion_status: string;
            }>(
                `
                SELECT contractor_user_id, completion_status
                FROM "ContractorAssignment"
                WHERE ticket_id = $1
                ORDER BY assigned_at DESC, assignment_id DESC
                LIMIT 1
                FOR UPDATE
                `,
                [ticketId]
            );
            const assignment = assignmentResult.rows[0];
            if (
                assignment?.contractor_user_id !== actorId ||
                assignment.completion_status === "Completed" ||
                assignment.completion_status === "Failed"
            ) {
                await client.query("ROLLBACK");
                return res.status(403).json({
                    success: false,
                    message: "You can only update tickets currently assigned to your account."
                });
            }
        }

        const statusChanged = ticket.status !== status;
        if (statusChanged && !normalizedReason) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "A reason is required when changing ticket status."
            });
        }

        let contractorName: string | null = null;
        let contractorEmail: string | null = null;
        let contractorChanged = false;
        let previousContractorName: string | null = null;
        if (normalizedContractorId !== null) {
            const contractorResult = await client.query<ContractorRow>(
                `
                SELECT
                    user_id,
                    CONCAT_WS(' ', full_name, full_surname) AS full_name,
                    email
                FROM "User"
                WHERE user_id = $1
                  AND role = 'Contractor'
                  AND LOWER(account_status::text) IN ('active', 'true')
                `,
                [normalizedContractorId]
            );
            const contractor = contractorResult.rows[0];
            if (!contractor) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "Choose an active contractor account."
                });
            }
            contractorName = contractor.full_name;
            contractorEmail = contractor.email ?? null;

            const activeAssignmentResult = await client.query<{
                assignment_id: string;
                contractor_user_id: number;
                contractor_name: string | null;
            }>(
                `
                SELECT
                    assignment.assignment_id::text,
                    assignment.contractor_user_id,
                    CONCAT_WS(' ', contractor.full_name, contractor.full_surname) AS contractor_name
                FROM "ContractorAssignment" AS assignment
                INNER JOIN "User" AS contractor
                    ON contractor.user_id = assignment.contractor_user_id
                WHERE assignment.ticket_id = $1
                  AND assignment.completion_status NOT IN ('Completed', 'Failed')
                ORDER BY assignment.assigned_at DESC, assignment.assignment_id DESC
                LIMIT 1
                FOR UPDATE OF assignment
                `,
                [ticketId]
            );
            const activeAssignment = activeAssignmentResult.rows[0];
            previousContractorName = activeAssignment?.contractor_name ?? null;
            if (!statusChanged && activeAssignment?.contractor_user_id === contractor.user_id) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: "No changes were selected."
                });
            }

            if (activeAssignment) {
                if (activeAssignment.contractor_user_id !== contractor.user_id) {
                    contractorChanged = true;
                    await client.query(
                        `
                        UPDATE "ContractorAssignment"
                        SET contractor_user_id = $1,
                            assigned_at = CURRENT_TIMESTAMP,
                            completion_status = 'Pending'
                        WHERE assignment_id = $2
                        `,
                        [contractor.user_id, activeAssignment.assignment_id]
                    );
                }
            } else {
                contractorChanged = true;
                await client.query(
                    `
                    INSERT INTO "ContractorAssignment" (ticket_id, contractor_user_id)
                    VALUES ($1, $2)
                    `,
                    [ticketId, contractor.user_id]
                );
            }
        } else if (!statusChanged) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "Choose a new status or contractor before saving."
            });
        }

        if (statusChanged) {
            const updateResult = await client.query<{ status: string }>(
                `
                UPDATE "Ticket"
                SET status = $1,
                    version = version + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ticket_id = $2
                RETURNING status
                `,
                [status, ticketId]
            );
            if (!updateResult.rows[0]) {
                throw new Error("Ticket status update did not return the updated ticket.");
            }
            await client.query(
                `
                INSERT INTO "AuditLog" (
                    ticket_id,
                    actor_id,
                    previous_status,
                    new_status,
                    change_reason
                )
                VALUES ($1, $2, $3, $4, $5)
                `,
                [ticketId, actorId, ticket.status, status, normalizedReason]
            );
        }
        await client.query("COMMIT");
        client.release();
        client = undefined;

        const changes: string[] = [];
        if (statusChanged) {
            changes.push(
                `Status changed from ${ticket.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}. Reason: ${normalizedReason}`
            );
        }
        if (contractorChanged) {
            changes.push(previousContractorName
                ? `Assigned contractor changed from ${previousContractorName} to ${contractorName}.`
                : `Contractor assigned: ${contractorName}.`);
        }

        let notification: { sent: boolean; message: string } | undefined;
        if (changes.length) {
            const recipients = [
                { label: "requester", email: ticket.requester_email }
            ];
            if (contractorChanged) {
                recipients.push({ label: "assigned contractor", email: contractorEmail });
            }
            const uniqueRecipients = recipients.filter((recipient, index, all) =>
                !recipient.email?.trim() ||
                all.findIndex((candidate) =>
                    candidate.email?.trim().toLowerCase() === recipient.email?.trim().toLowerCase()
                ) === index
            );
            const failedRecipients: string[] = [];
            for (const recipient of uniqueRecipients) {
                try {
                    await sendTicketChangeNotification({
                        recipientEmail: recipient.email,
                        trackingReference: ticket.tracking_ref,
                        changes
                    });
                } catch (emailError) {
                    console.error(
                        `Ticket was updated, but its ${recipient.label} notification email failed:`,
                        emailError
                    );
                    failedRecipients.push(recipient.label);
                }
            }
            notification = failedRecipients.length
                ? {
                    sent: false,
                    message: `Ticket was updated, but the ${failedRecipients.join(" and ")} notification email could not be sent. Check SMTP configuration, recipient email addresses, and server logs.`
                }
                : {
                    sent: true,
                    message: contractorChanged
                        ? "The requester and assigned contractor notification emails were accepted by the SMTP server."
                        : "The requester notification email was accepted by the SMTP server."
                };
        }

        return res.status(200).json({
            success: true,
            notification,
            ticket: {
                ticket_id: ticketId,
                status
            },
            assignment: normalizedContractorId === null
                ? undefined
                : {
                    contractor_user_id: normalizedContractorId,
                    contractor_name: contractorName
                }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Failed to roll back ticket status update:", rollbackError);
            }
        }
        console.error("Failed to update ticket status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update ticket status."
        });
    } finally {
        client?.release();
    }
});

export default router;
