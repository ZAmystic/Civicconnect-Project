import { describe, expect, it, vi } from "vitest";
import { createTicket, type CreateTicketInput } from "../../../src/routes/ticket_creation";

const thisYear = new Date().getUTCFullYear();

function createClient(
    lastNumber: string | undefined = "1005",
    categoryId: number | null = 4
) {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
            calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
            if (sql.includes("SELECT category_id")) {
                return { rows: categoryId === null ? [] : [{ category_id: categoryId }] };
            }
            if (sql.includes("SELECT COALESCE(MAX(")) {
                return { rows: lastNumber === undefined ? [] : [{ last_number: lastNumber }] };
            }
            if (sql.includes('INSERT INTO "Ticket"')) {
                return {
                    rows: [{ ticket_id: "ticket-1", tracking_ref: params?.[0] }]
                };
            }
            return { rows: [] };
        })
    };
    return { client, calls };
}

const input: CreateTicketInput = {
    citizenId: 8,
    categoryName: "Damaged Equipment",
    slaHours: 48,
    trackingCode: "D",
    description: "A damaged public bench."
};

describe("ticket reference allocation", () => {
    it("[UT-01] starts after the documented 1005 fallback and formats a category reference", async () => {
        const { client } = createClient();

        const result = await createTicket(client as never, input);

        expect(result.tracking_ref).toBe(`TCK-D-${thisYear}-1006`);
        expect(result.ticket_id).toBe("ticket-1");
    });

    it("[UT-02] accepts the shared sequence maximum even when the next ticket has another category", async () => {
        const { client } = createClient("2048");

        const result = await createTicket(client as never, {
            ...input,
            categoryName: "Maintenance",
            trackingCode: "M"
        });

        expect(result.tracking_ref).toBe(`TCK-M-${thisYear}-2049`);
    });

    it("[UT-03] preserves sequence numbers beyond four digits", async () => {
        const { client } = createClient("9999");

        const result = await createTicket(client as never, input);

        expect(result.tracking_ref).toBe(`TCK-D-${thisYear}-10000`);
    });

    it("[UT-04] acquires the yearly transaction lock before reading and inserting sequence values", async () => {
        const { client, calls } = createClient();
        await createTicket(client as never, input);

        const lockIndex = calls.findIndex(({ sql }) => sql.includes("pg_advisory_xact_lock"));
        const maximumIndex = calls.findIndex(({ sql }) => sql.includes("SELECT COALESCE(MAX("));
        const insertIndex = calls.findIndex(({ sql }) => sql.includes('INSERT INTO "Ticket"'));
        expect(lockIndex).toBeGreaterThan(-1);
        expect(lockIndex).toBeLessThan(maximumIndex);
        expect(maximumIndex).toBeLessThan(insertIndex);
        expect(calls[lockIndex]?.params).toEqual([`ticket-tracking-ref:${thisYear}`]);
    });

    it("[UT-05] stops before ticket insertion when the service category cannot be resolved", async () => {
        const { client, calls } = createClient("1005", null);

        await expect(createTicket(client as never, input)).rejects.toThrow(
            'The "Damaged Equipment" service category could not be created.'
        );
        expect(calls.some(({ sql }) => sql.includes('INSERT INTO "Ticket"'))).toBe(false);
    });
});
