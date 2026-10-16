import { Router, type Request, type Response } from "express";
import { hasAuditLogAccess } from "../auth/user_session";
import { dbPool } from "../config/database";

const router = Router();

interface ReportAnalytics {
    total_reports: number;
    reports_today: number;
    open_reports: number;
    resolved_reports: number;
    categories: Array<{
        category_name: string;
        report_count: number;
    }>;
    statuses: Array<{
        status: string;
        report_count: number;
    }>;
    daily_reports: Array<{
        report_date: string;
        report_count: number;
    }>;
}

router.get("/analytics", async (req: Request, res: Response) => {
    try {
        if (!(await hasAuditLogAccess(req))) {
            return res.status(403).json({
                success: false,
                message: "Only active Staff, Managers, and Admins can view report analytics."
            });
        }

        const result = await dbPool.query<ReportAnalytics>(`
            WITH category_counts AS (
                SELECT
                    category.category_name,
                    COUNT(ticket.ticket_id)::int AS report_count
                FROM "ServiceCategory" AS category
                LEFT JOIN "Ticket" AS ticket
                    ON ticket.category_id = category.category_id
                GROUP BY category.category_id, category.category_name
            ),
            status_counts AS (
                SELECT status, COUNT(*)::int AS report_count
                FROM "Ticket"
                GROUP BY status
            ),
            daily_counts AS (
                SELECT
                    day::date AS report_date,
                    COUNT(ticket.ticket_id)::int AS report_count
                FROM generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                ) AS days(day)
                LEFT JOIN "Ticket" AS ticket
                    ON ticket.created_at >= day::date
                   AND ticket.created_at < day::date + INTERVAL '1 day'
                GROUP BY day::date
            )
            SELECT
                (SELECT COUNT(*)::int FROM "Ticket") AS total_reports,
                (
                    SELECT COUNT(*)::int
                    FROM "Ticket"
                    WHERE created_at >= CURRENT_DATE
                      AND created_at < CURRENT_DATE + INTERVAL '1 day'
                ) AS reports_today,
                (
                    SELECT COUNT(*)::int
                    FROM "Ticket"
                    WHERE status IN ('Submitted', 'Assigned', 'In_Progress')
                ) AS open_reports,
                (
                    SELECT COUNT(*)::int
                    FROM "Ticket"
                    WHERE status IN ('Resolved', 'Closed')
                ) AS resolved_reports,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'category_name', category_name,
                            'report_count', report_count
                        )
                        ORDER BY report_count DESC, category_name
                    ) FROM category_counts),
                    '[]'::json
                ) AS categories,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'status', status,
                            'report_count', report_count
                        )
                        ORDER BY status
                    ) FROM status_counts),
                    '[]'::json
                ) AS statuses,
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'report_date', to_char(report_date, 'YYYY-MM-DD'),
                            'report_count', report_count
                        )
                        ORDER BY report_date
                    ) FROM daily_counts),
                    '[]'::json
                ) AS daily_reports
        `);

        return res.status(200).json({
            success: true,
            analytics: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to retrieve report analytics:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve report analytics."
        });
    }
});

export default router;
