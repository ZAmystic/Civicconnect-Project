import type { PoolClient } from "pg";

export interface CreateTicketInput {
    citizenId: number;
    categoryName: string;
    slaHours: number;
    trackingCode: string;
    description: string;
}

export interface CreatedTicket {
    ticket_id: string;
    tracking_ref: string;
}

interface CategoryIdRow {
    category_id: number;
}

interface TrackingNumberRow {
    last_number: string;
}

export async function createTicket(
    client: PoolClient,
    input: CreateTicketInput
): Promise<CreatedTicket> {
    await client.query(
        `
        INSERT INTO "ServiceCategory" (category_name, sla_hours)
        VALUES ($1, $2)
        ON CONFLICT (category_name) DO NOTHING
        `,
        [input.categoryName, input.slaHours]
    );
    const categoryResult = await client.query<CategoryIdRow>(
        'SELECT category_id FROM "ServiceCategory" WHERE category_name = $1',
        [input.categoryName]
    );
    const category = categoryResult.rows[0];
    if (!category) {
        throw new Error(`The "${input.categoryName}" service category could not be created.`);
    }

    const trackingYear = new Date().getUTCFullYear();
    const trackingPattern = `^TCK-(?:[A-Z]-)?${trackingYear}-([0-9]+)$`;
    await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`ticket-tracking-ref:${trackingYear}`]
    );
    const trackingNumberResult = await client.query<TrackingNumberRow>(
        `
        SELECT COALESCE(MAX((regexp_match(tracking_ref, $1))[1]::BIGINT), 1005)::text AS last_number
        FROM "Ticket"
        WHERE tracking_ref ~ $1
        `,
        [trackingPattern]
    );
    const lastNumber = trackingNumberResult.rows[0]?.last_number;
    if (lastNumber === undefined) {
        throw new Error("The latest ticket tracking number could not be determined.");
    }
    const nextTrackingNumber = (BigInt(lastNumber) + 1n).toString().padStart(4, "0");
    const trackingReference = `TCK-${input.trackingCode}-${trackingYear}-${nextTrackingNumber}`;
    const ticketResult = await client.query<CreatedTicket>(
        `
        INSERT INTO "Ticket" (
            tracking_ref,
            citizen_id,
            category_id,
            description
        )
        VALUES ($1, $2, $3, $4)
        RETURNING ticket_id::text, tracking_ref
        `,
        [trackingReference, input.citizenId, category.category_id, input.description]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
        throw new Error("The ticket was not returned after insertion.");
    }

    return ticket;
}
