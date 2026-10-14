import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    hasUserManagementAccess: vi.fn(),
    getSessionUserId: vi.fn(),
    sendTicketChangeNotification: vi.fn(),
    query: vi.fn(),
    connect: vi.fn()
}));

vi.mock("../../../src/auth/user_session", () => ({
    hasAuditLogAccess: mocks.hasUserManagementAccess,
    getSessionUserId: mocks.getSessionUserId
}));

vi.mock("../../../src/config/database", () => ({
    dbPool: { query: mocks.query, connect: mocks.connect }
}));

vi.mock("../../../src/services/ticket_notifications", () => ({
    sendTicketChangeNotification: mocks.sendTicketChangeNotification
}));

const { default: ticketRoutes } = await import("../../../src/routes/ticket_routes");
const { default: express } = await import("express");
const app = express();
app.use(express.json());
app.use("/api/tickets", ticketRoutes);

let server: ReturnType<typeof app.listen> | undefined;
let baseUrl = "";
let transactionCalls: Array<{ sql: string; params: unknown[] }> = [];
let releaseTicketClient: ReturnType<typeof vi.fn>;

beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
        server?.once("listening", resolve);
        server?.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("The ticket API test server did not start.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    if (server) {
        const currentServer = server;
        server = undefined;
        await new Promise<void>((resolve, reject) => {
            currentServer.close((error) => error ? reject(error) : resolve());
        });
    }
});

beforeEach(() => {
    vi.clearAllMocks();
    transactionCalls = [];
    releaseTicketClient = vi.fn();
    mocks.hasUserManagementAccess.mockResolvedValue(true);
    mocks.getSessionUserId.mockReturnValue(42);
    mocks.sendTicketChangeNotification.mockResolvedValue(undefined);
    mocks.connect.mockResolvedValue({
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
            const normalizedSql = sql.replace(/\s+/g, " ").trim();
            transactionCalls.push({ sql: normalizedSql, params });
            if (normalizedSql.startsWith("SELECT ticket.status")) {
                return {
                    rows: [{
                        status: "Submitted",
                        tracking_ref: "TCK-F-2026-1001",
                        requester_email: "alex@example.test"
                    }]
                };
            }
            if (normalizedSql.startsWith('UPDATE "Ticket"')) {
                return { rows: [{ status: "In_Progress" }] };
            }
            return { rows: [] };
        }),
        release: releaseTicketClient
    });
    mocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes(`FROM "User"`) && sql.includes("role = 'Contractor'")) {
            return {
                rows: [{
                    user_id: 88,
                    full_name: "Contractor One"
                }]
            };
        }
        if (sql.includes("COUNT(*)")) {
            return { rows: [{ total: "1" }] };
        }
        return {
            rows: [{
                ticket_id: "12",
                tracking_ref: "TCK-F-2026-1001",
                requester_name: "Alex Citizen",
                category_name: "Facility Faults",
                description: "A damaged light in the park.",
                status: "Submitted",
                created_at: "2026-10-01T10:00:00.000Z",
                contractor_user_id: null,
                contractor_name: null
            }]
        };
    });
});

describe("ticket administration API", () => {
    it("[API-05] returns paginated ticket records and applies search and status filters", async () => {
        const response = await fetch(
            `${baseUrl}/api/tickets?page=1&search=Alex&status=Submitted`
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            tickets: [{
                tracking_ref: "TCK-F-2026-1001",
                requester_name: "Alex Citizen",
                category_name: "Facility Faults",
                status: "Submitted"
            }],
            pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 }
        });
        expect(mocks.query).toHaveBeenCalledTimes(2);
        expect(mocks.query.mock.calls[0][0]).toContain("requester.full_name ILIKE $1");
        expect(mocks.query.mock.calls[0][1]).toEqual(["%Alex%", "Submitted"]);
        expect(mocks.query.mock.calls[1][1]).toEqual(["%Alex%", "Submitted", 25, 0]);
    });

    it("[API-06] denies non-management users without querying ticket data", async () => {
        mocks.hasUserManagementAccess.mockResolvedValue(false);

        const response = await fetch(`${baseUrl}/api/tickets`);

        expect(response.status).toBe(403);
        expect((await response.json()).success).toBe(false);
        expect(mocks.query).not.toHaveBeenCalled();
    });

    it("[API-07] rejects invalid status filters before querying tickets", async () => {
        const response = await fetch(`${baseUrl}/api/tickets?status=Unknown`);

        expect(response.status).toBe(400);
        expect((await response.json()).success).toBe(false);
        expect(mocks.query).not.toHaveBeenCalled();
    });

    it("[API-08] updates status and records the actor and reason in the audit log transaction", async () => {
        const response = await fetch(`${baseUrl}/api/tickets/12/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: "In_Progress",
                reason: "Work has started on the reported fault."
            })
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({
            success: true,
            ticket: { ticket_id: "12", status: "In_Progress" }
        });
        expect(transactionCalls.map(({ sql }) => sql)).toEqual([
            "BEGIN",
            expect.stringContaining('FROM "Ticket" AS ticket'),
            expect.stringContaining('UPDATE "Ticket"'),
            expect.stringContaining('INSERT INTO "AuditLog"'),
            "COMMIT"
        ]);
        expect(transactionCalls[3].params).toEqual([
            "12",
            42,
            "Submitted",
            "In_Progress",
            "Work has started on the reported fault."
        ]);
        expect(mocks.sendTicketChangeNotification).toHaveBeenCalledWith({
            recipientEmail: "alex@example.test",
            trackingReference: "TCK-F-2026-1001",
            changes: [
                "Status changed from Submitted to In Progress. Reason: Work has started on the reported fault."
            ]
        });
        expect(body.notification).toMatchObject({ sent: true });
        expect(releaseTicketClient).toHaveBeenCalledOnce();
    });

    it("[API-09] requires a reason and rejects invalid ticket status updates", async () => {
        const response = await fetch(`${baseUrl}/api/tickets/12/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Unknown", reason: "" })
        });

        expect(response.status).toBe(400);
        expect((await response.json()).success).toBe(false);
        expect(mocks.connect).not.toHaveBeenCalled();
    });

    it("[API-10] lists active contractor choices for ticket assignment", async () => {
        const response = await fetch(`${baseUrl}/api/tickets/contractors`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            contractors: [{ user_id: 88, full_name: "Contractor One" }]
        });
        expect(mocks.query).toHaveBeenCalledOnce();
        expect(mocks.query.mock.calls[0][0]).toContain("role = 'Contractor'");
        expect(mocks.query.mock.calls[0][0]).toContain(
            "LOWER(account_status::text) IN ('active', 'true')"
        );
    });

    it("[API-11] saves ticket status and contractor assignment in one transaction", async () => {
        const combinedUpdateQueries: Array<{ sql: string; params: unknown[] }> = [];
        const combinedUpdateClient = {
            query: vi.fn(async (sql: string, params: unknown[] = []) => {
                const normalizedSql = sql.replace(/\s+/g, " ").trim();
                combinedUpdateQueries.push({ sql: normalizedSql, params });
                if (normalizedSql.startsWith("SELECT ticket.status")) {
                    return {
                        rows: [{
                            status: "Submitted",
                            tracking_ref: "TCK-F-2026-1001",
                            requester_email: "alex@example.test"
                        }]
                    };
                }
                if (normalizedSql.startsWith('SELECT user_id, CONCAT_WS')) {
                    return { rows: [{ user_id: 88, full_name: "Contractor One" }] };
                }
                if (normalizedSql.startsWith('UPDATE "Ticket"')) {
                    return { rows: [{ status: "In_Progress" }] };
                }
                return { rows: [] };
            }),
            release: vi.fn()
        };
        mocks.connect.mockResolvedValue(combinedUpdateClient);

        const response = await fetch(`${baseUrl}/api/tickets/12/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: "In_Progress",
                reason: "Contractor dispatched to begin the repair.",
                contractorId: 88
            })
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true,
            ticket: { ticket_id: "12", status: "In_Progress" },
            assignment: { contractor_user_id: 88, contractor_name: "Contractor One" },
            notification: { sent: true }
        });
        expect(combinedUpdateQueries.map(({ sql }) => sql)).toEqual([
            "BEGIN",
            expect.stringContaining('FROM "Ticket" AS ticket'),
            expect.stringContaining("role = 'Contractor'"),
            expect.stringContaining('FROM "ContractorAssignment" AS assignment'),
            expect.stringContaining('INSERT INTO "ContractorAssignment"'),
            expect.stringContaining('UPDATE "Ticket"'),
            expect.stringContaining('INSERT INTO "AuditLog"'),
            "COMMIT"
        ]);
        expect(mocks.sendTicketChangeNotification).toHaveBeenCalledWith({
            recipientEmail: "alex@example.test",
            trackingReference: "TCK-F-2026-1001",
            changes: [
                "Status changed from Submitted to In Progress. Reason: Contractor dispatched to begin the repair.",
                "Contractor assigned: Contractor One."
            ]
        });
        expect(combinedUpdateClient.release).toHaveBeenCalledOnce();
    });

    it("[API-12] reports email delivery failures without discarding a saved ticket change", async () => {
        mocks.sendTicketChangeNotification.mockRejectedValue(new Error("SMTP connection failed."));

        const response = await fetch(`${baseUrl}/api/tickets/12/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: "In_Progress",
                reason: "Work has started on the reported fault."
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            ticket: { status: "In_Progress" },
            notification: {
                sent: false,
                message: expect.stringContaining("notification email could not be sent")
            }
        });
        expect(transactionCalls.at(-1)?.sql).toBe("COMMIT");
    });
});
