import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSessionUserId: vi.fn(),
    connect: vi.fn(),
    query: vi.fn()
}));

vi.mock("../../../src/auth/user_session", () => ({
    getSessionUserId: mocks.getSessionUserId
}));

vi.mock("../../../src/config/database", () => ({
    dbPool: { connect: mocks.connect, query: mocks.query }
}));

const { default: requestRoutes } = await import("../../../src/routes/request_routes");
const { default: express } = await import("express");
const app = express();
app.use(express.json());
app.use("/api/requests", requestRoutes);

let server: ReturnType<typeof app.listen> | undefined;

export interface QueryCall {
    sql: string;
    params: unknown[];
}

export interface HarnessOptions {
    sessionUserId?: number | null;
    accountStatus?: boolean | string;
    failDetailInsert?: boolean;
    failEditAuditInsert?: boolean;
    missingTicketEditAuditTable?: boolean;
    lastTrackingNumber?: string;
    editTicketStatus?: string;
    editTicketNotFound?: boolean;
}

export interface RequestApiHarness {
    baseUrl: string;
    calls: QueryCall[];
    release: ReturnType<typeof vi.fn>;
}

export async function startRequestApiServer(): Promise<void> {
    if (server) {
        return;
    }
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
        server?.once("listening", resolve);
        server?.once("error", reject);
    });
}

export async function stopRequestApiServer(): Promise<void> {
    if (!server) {
        return;
    }
    const currentServer = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => error ? reject(error) : resolve());
    });
}

export function resetRequestApiHarness(options: HarnessOptions = {}): RequestApiHarness {
    const calls: QueryCall[] = [];
    const release = vi.fn();
    const userId = options.sessionUserId === undefined ? 42 : options.sessionUserId;
    const status = options.accountStatus ?? "active";
    const lastTrackingNumber = options.lastTrackingNumber ?? "1025";

    mocks.getSessionUserId.mockReturnValue(userId);
    mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
        const normalizedSql = sql.replace(/\s+/g, " ").trim();
        calls.push({ sql: normalizedSql, params });
        if (normalizedSql.includes('SELECT account_status FROM "User"')) {
            return { rows: [{ account_status: status }] };
        }
        if (normalizedSql.includes("WITH scoped_tickets AS")) {
            return {
                rows: [{
                    total_tickets: 3,
                    active_tickets: 1,
                    completed_tickets: 1,
                    rejected_tickets: 1,
                    recent_tickets: 2,
                    last_activity_at: "2026-10-14T10:00:00.000Z",
                    tickets: []
                }]
            };
        }
        return { rows: [] };
    });

    const client = {
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
            const normalizedSql = sql.replace(/\s+/g, " ").trim();
            calls.push({ sql: normalizedSql, params });

            if (normalizedSql.includes('SELECT account_status FROM "User"')) {
                return { rows: [{ account_status: status }] };
            }
            if (normalizedSql.includes("FOR UPDATE OF ticket")) {
                if (options.editTicketNotFound) {
                    return { rows: [] };
                }
                return {
                    rows: [{
                        ticket_id: "7",
                        category_name: "Damaged Equipment",
                        description: "A damaged bench.",
                        status: options.editTicketStatus ?? "Submitted",
                        updated_at: "2026-10-14T10:00:00.000Z",
                        details: {
                            equipmentType: "Park Bench / Table",
                            assetId: "BENCH-22",
                            location: "Civic Park",
                            locationLatitude: 12.5,
                            locationLongitude: -45.25,
                            damageType: ["broken-vandalized"],
                            operationalStatus: "out-of-service",
                            description: "A damaged bench."
                        }
                    }]
                };
            }
            if (normalizedSql.includes('INSERT INTO "TicketEditAudit"')) {
                if (options.missingTicketEditAuditTable) {
                    throw Object.assign(new Error('relation "TicketEditAudit" does not exist'), {
                        code: "42P01"
                    });
                }
                if (options.failEditAuditInsert) {
                    throw new Error("Simulated ticket edit audit failure.");
                }
            }
            if (/^UPDATE "(?:DamagedEquipmentDetails|SecurityConcernDetails|ITSupportDetails|MaintenanceDetails|LostPropertyDetails|GeneralRequestDetails|FacilityFaultDetails)"/.test(normalizedSql)) {
                return { rows: [], rowCount: 1 };
            }
            if (normalizedSql.includes("UPDATE \"Ticket\"")) {
                return { rows: [{ updated_at: "2026-10-14T11:00:00.000Z" }] };
            }
            if (normalizedSql.includes('SELECT category_id FROM "ServiceCategory"')) {
                return { rows: [{ category_id: 7 }] };
            }
            if (normalizedSql.includes("SELECT COALESCE(MAX(")) {
                return { rows: [{ last_number: lastTrackingNumber }] };
            }
            if (normalizedSql.includes('INSERT INTO "Ticket"')) {
                return {
                    rows: [{
                        ticket_id: "test-ticket-7",
                        tracking_ref: params[0]
                    }]
                };
            }
            if (
                options.failDetailInsert &&
                /INSERT INTO "(?:DamagedEquipmentDetails|GeneralRequestDetails)"/.test(normalizedSql)
            ) {
                throw new Error("Simulated typed-details constraint failure.");
            }
            return { rows: [] };
        }),
        release
    };
    mocks.connect.mockResolvedValue(client);

    const address = server?.address();
    if (!address || typeof address === "string") {
        throw new Error("The request API test server has not started.");
    }
    return { baseUrl: `http://127.0.0.1:${address.port}`, calls, release };
}
