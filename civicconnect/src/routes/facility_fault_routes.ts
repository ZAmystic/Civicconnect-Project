import { Router, type Request, type Response } from "express";
import { getSessionUserId } from "../auth/user_session";
import { dbPool } from "../config/database";

const router = Router();
const faultClassifications = [
    "plumbing",
    "hvac",
    "elevator",
    "structural",
    "roof",
    "electrical"
] as const;
const urgencyLevels = ["routine", "moderate", "critical"] as const;

interface CreateFacilityFaultBody {
    facilityAddress: string;
    latitude: number | null;
    longitude: number | null;
    faultClassification: typeof faultClassifications[number];
    urgency: typeof urgencyLevels[number];
    incidentDescription: string;
}

interface TicketIdRow {
    ticket_id: string;
}

interface CategoryIdRow {
    category_id: number;
}

interface TrackingNumberRow {
    last_number: string;
}

interface UserStatusRow {
    account_status: boolean | string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoordinate(value: unknown, minimum: number, maximum: number): number | null | undefined {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum
    ) {
        return undefined;
    }
    return value;
}

function isFaultClassification(value: unknown): value is CreateFacilityFaultBody["faultClassification"] {
    return typeof value === "string" && faultClassifications.some((classification) => classification === value);
}

function isUrgencyLevel(value: unknown): value is CreateFacilityFaultBody["urgency"] {
    return typeof value === "string" && urgencyLevels.some((urgency) => urgency === value);
}

function parseRequestBody(value: unknown): CreateFacilityFaultBody | null {
    if (!isRecord(value)) {
        return null;
    }

    const facilityAddress =
        typeof value.facilityAddress === "string" ? value.facilityAddress.trim() : "";
    const incidentDescription =
        typeof value.incidentDescription === "string" ? value.incidentDescription.trim() : "";
    const faultClassification = value.faultClassification;
    const urgency = value.urgency;
    const latitude = parseCoordinate(value.latitude, -90, 90);
    const longitude = parseCoordinate(value.longitude, -180, 180);

    if (
        facilityAddress.length === 0 ||
        facilityAddress.length > 300 ||
        incidentDescription.length === 0 ||
        incidentDescription.length > 3000 ||
        latitude === undefined ||
        longitude === undefined ||
        (latitude === null) !== (longitude === null) ||
        !isFaultClassification(faultClassification) ||
        !isUrgencyLevel(urgency)
    ) {
        return null;
    }

    return {
        facilityAddress,
        latitude,
        longitude,
        faultClassification,
        urgency,
        incidentDescription
    };
}

function isActiveAccount(value: boolean | string): boolean {
    return value === true ||
        String(value).toLowerCase() === "active" ||
        String(value).toLowerCase() === "true";
}

router.post("/", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return res.status(401).json({
            success: false,
            message: "Sign in before submitting a facility report."
        });
    }

    const body = parseRequestBody(req.body);
    if (!body) {
        return res.status(400).json({
            success: false,
            message: "Check the address, fault classification, urgency, description, and map coordinates."
        });
    }

    let client;
    try {
        client = await dbPool.connect();
        await client.query("BEGIN");

        const userResult = await client.query<UserStatusRow>(
            'SELECT account_status FROM "User" WHERE user_id = $1 FOR SHARE',
            [userId]
        );
        const user = userResult.rows[0];
        if (!user || !isActiveAccount(user.account_status)) {
            await client.query("ROLLBACK");
            return res.status(401).json({
                success: false,
                message: "Your account is unavailable. Sign in again before submitting a report."
            });
        }

        await client.query(
            `
            INSERT INTO "ServiceCategory" (category_name, sla_hours)
            VALUES ('Facility Faults', 48)
            ON CONFLICT (category_name) DO NOTHING
            `
        );
        const categoryResult = await client.query<CategoryIdRow>(
            'SELECT category_id FROM "ServiceCategory" WHERE category_name = $1',
            ["Facility Faults"]
        );
        const category = categoryResult.rows[0];
        if (!category) {
            throw new Error('The "Facility Faults" service category could not be created.');
        }

        const sequenceResult = await client.query<TicketIdRow>(
            `SELECT nextval(pg_get_serial_sequence('"Ticket"', 'ticket_id'))::text AS ticket_id`
        );
        const ticketId = BigInt(sequenceResult.rows[0].ticket_id);
        const ticketIdText = ticketId.toString();
        const trackingYear = new Date().getUTCFullYear();
        const trackingPattern = `^TCK-F-${trackingYear}-([0-9]+)$`;
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            [`facility-fault-tracking-ref:${trackingYear}`]
        );
        const trackingNumberResult = await client.query<TrackingNumberRow>(
            `
            SELECT COALESCE(MAX((regexp_match(tracking_ref, $1))[1]::BIGINT), 1005)::text AS last_number
            FROM "Ticket"
            WHERE tracking_ref ~ $1
            `,
            [trackingPattern]
        );
        const nextTrackingNumber = (BigInt(trackingNumberResult.rows[0].last_number) + 1n)
            .toString()
            .padStart(4, "0");
        const trackingReference = `TCK-F-${trackingYear}-${nextTrackingNumber}`;
        const ticketResult = await client.query<{ ticket_id: string; tracking_ref: string }>(
            `
            INSERT INTO "Ticket" (
                ticket_id,
                tracking_ref,
                citizen_id,
                category_id,
                description
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING ticket_id::text, tracking_ref
            `,
            [
                ticketIdText,
                trackingReference,
                userId,
                category.category_id,
                body.incidentDescription
            ]
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            throw new Error("The facility ticket was not returned after insertion.");
        }

        await client.query(
            `
            INSERT INTO "FacilityFaultDetails" (
                ticket_id,
                facility_address,
                latitude,
                longitude,
                fault_classification,
                urgency
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                ticket.ticket_id,
                body.facilityAddress,
                body.latitude,
                body.longitude,
                body.faultClassification,
                body.urgency
            ]
        );

        await client.query("COMMIT");
        return res.status(201).json({
            success: true,
            message: "Facility report submitted.",
            ticket: {
                ticket_id: ticket.ticket_id,
                tracking_ref: ticket.tracking_ref
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Facility report transaction rollback failed:", rollbackError);
            }
        }
        console.error("Facility report submission failed:", error);
        return res.status(500).json({
            success: false,
            message: "The facility report could not be saved. Please try again."
        });
    } finally {
        client?.release();
    }
});

export default router;
