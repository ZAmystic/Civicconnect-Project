import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { getSessionUserId } from "../auth/user_session";
import { dbPool } from "../config/database";
import { createTicket } from "./ticket_creation";

type FieldRule =
    | { kind: "text"; required?: boolean; maxLength: number; values?: readonly string[] }
    | { kind: "boolean" }
    | { kind: "coordinate"; minimum: number; maximum: number }
    | { kind: "text-list"; required?: boolean; values: readonly string[] };

interface RequestTypeConfig {
    categoryName: string;
    trackingCode: string;
    slaHours: number;
    fields: Record<string, FieldRule>;
}

interface UserStatusRow {
    account_status: boolean | string;
}

interface DashboardMetricsRow {
    total_tickets: number;
    active_tickets: number;
    completed_tickets: number;
    rejected_tickets: number;
    recent_tickets: number;
    last_activity_at: string | null;
    tickets: Array<{
        ticket_id: string;
        tracking_ref: string;
        category_name: string;
        description: string;
        status: string;
        created_at: string;
        updated_at: string;
        details: Record<string, unknown> | null;
    }>;
}

type ParsedFields = Record<string, string | number | boolean | null>;

const requestTypes: Record<string, RequestTypeConfig> = {
    "damaged-equipment": {
        categoryName: "Damaged Equipment",
        trackingCode: "D",
        slaHours: 48,
        fields: {
            equipmentType: {
                kind: "text",
                required: true,
                maxLength: 80,
                values: [
                    "Playground Structure",
                    "Public Gym Unit",
                    "Park Bench / Table",
                    "Trash Receptacle",
                    "Electrical Substation Box",
                    "Traffic Control Box"
                ]
            },
            assetId: { kind: "text", maxLength: 80 },
            location: { kind: "text", required: true, maxLength: 300 },
            locationLatitude: { kind: "coordinate", minimum: -90, maximum: 90 },
            locationLongitude: { kind: "coordinate", minimum: -180, maximum: 180 },
            damageType: {
                kind: "text-list",
                required: true,
                values: ["broken-vandalized", "missing-components", "sharp-edge", "unstable-base", "exposed-wires"]
            },
            operationalStatus: {
                kind: "text",
                required: true,
                maxLength: 40,
                values: ["partially-usable", "out-of-service", "immediate-danger"]
            },
            description: { kind: "text", required: true, maxLength: 3000 }
        }
    },
    "security-concerns": {
        categoryName: "Security Concerns",
        trackingCode: "S",
        slaHours: 24,
        fields: {
            concernType: {
                kind: "text",
                required: true,
                maxLength: 80,
                values: [
                    "Broken Perimeter Fencing",
                    "Gate / Access Control Malfunction",
                    "Dark / Unlit Zone",
                    "CCTV / Camera Damage",
                    "Unauthorized Squatting / Trespassing",
                    "Vandalism in Progress"
                ]
            },
            location: { kind: "text", required: true, maxLength: 300 },
            locationLatitude: { kind: "coordinate", minimum: -90, maximum: 90 },
            locationLongitude: { kind: "coordinate", minimum: -180, maximum: 180 },
            frequency: { kind: "text", required: true, maxLength: 20, values: ["single", "recurring", "ongoing"] },
            lighting: { kind: "text", required: true, maxLength: 20, values: ["fully-lit", "dim", "dark"] },
            immediateThreat: { kind: "boolean" },
            description: { kind: "text", required: true, maxLength: 3000 }
        }
    },
    "it-support": {
        categoryName: "IT Support",
        trackingCode: "I",
        slaHours: 48,
        fields: {
            systemAffected: {
                kind: "text",
                required: true,
                maxLength: 80,
                values: [
                    "Public Wi-Fi Hotspot",
                    "Civic Terminal Kiosk",
                    "Staff Workstation",
                    "Official Email / Portal Account",
                    "Network / Internet Connectivity"
                ]
            },
            deviceId: { kind: "text", maxLength: 100 },
            issueType: {
                kind: "text",
                required: true,
                maxLength: 80,
                values: [
                    "Offline / No Signal",
                    "Screen Touch Unresponsive",
                    "Software Error / Frozen",
                    "Hardware Damage",
                    "Login / Authentication Failure"
                ]
            },
            errorCode: { kind: "text", maxLength: 300 },
            description: { kind: "text", required: true, maxLength: 3000 }
        }
    },
    "maintenance": {
        categoryName: "Maintenance",
        trackingCode: "M",
        slaHours: 72,
        fields: {
            maintenanceType: {
                kind: "text",
                required: true,
                maxLength: 100,
                values: [
                    "Pothole / Road Degradation",
                    "Water Pipe Leak / Burst",
                    "Overgrown Vegetation / Fallen Tree Limb",
                    "Streetlight Failure",
                    "Illegal Dumping / Trash Accumulation",
                    "Drainage / Stormwater Blockage"
                ]
            },
            location: { kind: "text", required: true, maxLength: 300 },
            locationLatitude: { kind: "coordinate", minimum: -90, maximum: 90 },
            locationLongitude: { kind: "coordinate", minimum: -180, maximum: 180 },
            severity: {
                kind: "text",
                required: true,
                maxLength: 30,
                values: ["isolated", "pedestrian-blocked", "traffic-blocked"]
            },
            utilityInvolvement: {
                kind: "text-list",
                values: ["gushing-water", "exposed-line", "sewage-odor"]
            },
            estimatedSize: {
                kind: "text",
                required: true,
                maxLength: 30,
                values: ["Small <1m²", "Moderate 1–5m²", "Extensive >5m²"]
            },
            description: { kind: "text", required: true, maxLength: 3000 }
        }
    },
    "lost-property": {
        categoryName: "Lost Property",
        trackingCode: "L",
        slaHours: 48,
        fields: {
            reportingMode: { kind: "text", required: true, maxLength: 10, values: ["lost", "found"] },
            itemCategory: {
                kind: "text",
                required: true,
                maxLength: 50,
                values: [
                    "Electronics / Phone",
                    "Keys",
                    "Wallet / ID / Documents",
                    "Jewelry / Valuables",
                    "Bag / Clothing",
                    "Other"
                ]
            },
            dateTime: { kind: "text", required: true, maxLength: 30 },
            location: { kind: "text", required: true, maxLength: 300 },
            locationLatitude: { kind: "coordinate", minimum: -90, maximum: 90 },
            locationLongitude: { kind: "coordinate", minimum: -180, maximum: 180 },
            description: { kind: "text", required: true, maxLength: 3000 }
        }
    },
    "general-request": {
        categoryName: "General Requests",
        trackingCode: "G",
        slaHours: 72,
        fields: {
            topic: { kind: "text", required: true, maxLength: 160 },
            departmentSuggestion: {
                kind: "text",
                maxLength: 40,
                values: ["Public Works", "Sanitation", "Parks & Recreation", "General Administration", "Unknown"]
            },
            urgency: { kind: "text", required: true, maxLength: 20, values: ["low", "standard", "high"] },
            details: { kind: "text", maxLength: 3000 }
        }
    }
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFields(
    value: unknown,
    config: RequestTypeConfig
): ParsedFields | null {
    if (!isRecord(value) || Object.keys(value).some((key) => !(key in config.fields))) {
        return null;
    }
    const parsed: ParsedFields = {};
    for (const [name, rule] of Object.entries(config.fields)) {
        const input = value[name];
        if (rule.kind === "boolean") {
            if (input !== undefined && typeof input !== "boolean") {
                return null;
            }
            parsed[name] = input === true;
        } else if (rule.kind === "coordinate") {
            if (input === undefined || input === null || input === "") {
                parsed[name] = null;
                continue;
            }
            const coordinate = typeof input === "number" ? input : Number(input);
            if (
                !Number.isFinite(coordinate) ||
                coordinate < rule.minimum ||
                coordinate > rule.maximum
            ) {
                return null;
            }
            parsed[name] = coordinate;
        } else if (rule.kind === "text-list") {
            if (input === undefined) {
                parsed[name] = "";
                continue;
            }
            const selections = Array.isArray(input) ? input : [input];
            if (
                (rule.required && selections.length === 0) ||
                selections.some((selection) =>
                    typeof selection !== "string" ||
                    !rule.values.some((allowed) => allowed === selection)
                )
            ) {
                return null;
            }
            parsed[name] = (selections as string[]).join("; ");
        } else {
            if (input === undefined && !rule.required) {
                parsed[name] = "";
                continue;
            }
            if (typeof input !== "string") {
                return null;
            }
            const text = input.trim();
            if (
                (rule.required && text.length === 0) ||
                text.length > rule.maxLength ||
                (rule.values && text !== "" && !rule.values.some((allowed) => allowed === text))
            ) {
                return null;
            }
            parsed[name] = text;
        }
    }

    const latitude = parsed.locationLatitude;
    const longitude = parsed.locationLongitude;
    if ((latitude === null) !== (longitude === null)) {
        return null;
    }
    return parsed;
}

function isActiveAccount(value: boolean | string): boolean {
    return value === true ||
        String(value).toLowerCase() === "active" ||
        String(value).toLowerCase() === "true";
}

function getTicketDescription(
    requestType: string,
    fields: ParsedFields
): string {
    if (requestType === "general-request") {
        const topic = fields.topic;
        const details = fields.details;
        return `${topic}${typeof details === "string" && details ? `\n\n${details}` : ""}`;
    }
    const description = fields.description;
    if (typeof description !== "string") {
        throw new Error(`Request type "${requestType}" is missing its description.`);
    }
    return description;
}

function getStringField(fields: ParsedFields, name: string): string {
    const value = fields[name];
    if (typeof value !== "string") {
        throw new Error(`The request is missing its "${name}" text field.`);
    }
    return value;
}

function getCoordinateField(fields: ParsedFields, name: string): number | null {
    const value = fields[name];
    if (value === null) {
        return null;
    }
    if (typeof value !== "number") {
        throw new Error(`The request is missing its "${name}" coordinate field.`);
    }
    return value;
}

function getBooleanField(fields: ParsedFields, name: string): boolean {
    const value = fields[name];
    if (typeof value !== "boolean") {
        throw new Error(`The request is missing its "${name}" boolean field.`);
    }
    return value;
}

async function saveRequestDetails(
    client: PoolClient,
    ticketId: string,
    requestType: string,
    fields: ParsedFields
): Promise<void> {
    switch (requestType) {
        case "damaged-equipment":
            await client.query(
                `
                INSERT INTO "DamagedEquipmentDetails" (
                    ticket_id, equipment_type, asset_id, location, latitude, longitude,
                    damage_types, operational_status, description
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [
                    ticketId,
                    getStringField(fields, "equipmentType"),
                    getStringField(fields, "assetId"),
                    getStringField(fields, "location"),
                    getCoordinateField(fields, "locationLatitude"),
                    getCoordinateField(fields, "locationLongitude"),
                    getStringField(fields, "damageType"),
                    getStringField(fields, "operationalStatus"),
                    getStringField(fields, "description")
                ]
            );
            return;
        case "security-concerns":
            await client.query(
                `
                INSERT INTO "SecurityConcernDetails" (
                    ticket_id, concern_type, location, latitude, longitude, frequency,
                    lighting, immediate_threat, description
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [
                    ticketId,
                    getStringField(fields, "concernType"),
                    getStringField(fields, "location"),
                    getCoordinateField(fields, "locationLatitude"),
                    getCoordinateField(fields, "locationLongitude"),
                    getStringField(fields, "frequency"),
                    getStringField(fields, "lighting"),
                    getBooleanField(fields, "immediateThreat"),
                    getStringField(fields, "description")
                ]
            );
            return;
        case "it-support":
            await client.query(
                `
                INSERT INTO "ITSupportDetails" (
                    ticket_id, system_affected, device_id, issue_type, error_message, description
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                `,
                [
                    ticketId,
                    getStringField(fields, "systemAffected"),
                    getStringField(fields, "deviceId"),
                    getStringField(fields, "issueType"),
                    getStringField(fields, "errorCode"),
                    getStringField(fields, "description")
                ]
            );
            return;
        case "maintenance":
            await client.query(
                `
                INSERT INTO "MaintenanceDetails" (
                    ticket_id, maintenance_type, location, latitude, longitude, severity,
                    utility_involvement, estimated_size, description
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [
                    ticketId,
                    getStringField(fields, "maintenanceType"),
                    getStringField(fields, "location"),
                    getCoordinateField(fields, "locationLatitude"),
                    getCoordinateField(fields, "locationLongitude"),
                    getStringField(fields, "severity"),
                    getStringField(fields, "utilityInvolvement"),
                    getStringField(fields, "estimatedSize"),
                    getStringField(fields, "description")
                ]
            );
            return;
        case "lost-property":
            await client.query(
                `
                INSERT INTO "LostPropertyDetails" (
                    ticket_id, reporting_mode, item_category, occurred_at, location,
                    latitude, longitude, description
                )
                VALUES ($1, $2, $3, $4::TIMESTAMP, $5, $6, $7, $8)
                `,
                [
                    ticketId,
                    getStringField(fields, "reportingMode"),
                    getStringField(fields, "itemCategory"),
                    getStringField(fields, "dateTime"),
                    getStringField(fields, "location"),
                    getCoordinateField(fields, "locationLatitude"),
                    getCoordinateField(fields, "locationLongitude"),
                    getStringField(fields, "description")
                ]
            );
            return;
        case "general-request":
            await client.query(
                `
                INSERT INTO "GeneralRequestDetails" (
                    ticket_id, topic, department_suggestion, urgency, additional_details
                )
                VALUES ($1, $2, NULLIF($3, ''), $4, $5)
                `,
                [
                    ticketId,
                    getStringField(fields, "topic"),
                    getStringField(fields, "departmentSuggestion"),
                    getStringField(fields, "urgency"),
                    getStringField(fields, "details")
                ]
            );
            return;
        default:
            throw new Error(`Unsupported service request type "${requestType}".`);
    }
}

const router = Router();

router.get("/mine", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return res.status(401).json({
            success: false,
            message: "Sign in to view your service requests."
        });
    }

    try {
        const userResult = await dbPool.query<UserStatusRow>(
            'SELECT account_status FROM "User" WHERE user_id = $1',
            [userId]
        );
        const user = userResult.rows[0];
        if (!user || !isActiveAccount(user.account_status)) {
            return res.status(401).json({
                success: false,
                message: "Your account is unavailable. Sign in again."
            });
        }

        const result = await dbPool.query<DashboardMetricsRow>(
            `
            WITH scoped_tickets AS (
                SELECT
                    ticket.ticket_id::text AS ticket_id,
                    ticket.tracking_ref,
                    category.category_name,
                    ticket.description,
                    ticket.status,
                    ticket.created_at,
                    ticket.updated_at,
                    COALESCE(
                        to_jsonb(damaged_details) - 'ticket_id' - 'created_at',
                        to_jsonb(security_details) - 'ticket_id' - 'created_at',
                        to_jsonb(it_details) - 'ticket_id' - 'created_at',
                        to_jsonb(maintenance_details) - 'ticket_id' - 'created_at',
                        to_jsonb(lost_property_details) - 'ticket_id' - 'created_at',
                        to_jsonb(general_details) - 'ticket_id' - 'created_at',
                        to_jsonb(facility_fault_details) - 'ticket_id' - 'created_at'
                    ) AS details
                FROM "Ticket" AS ticket
                JOIN "ServiceCategory" AS category USING (category_id)
                LEFT JOIN "DamagedEquipmentDetails" AS damaged_details
                    ON damaged_details.ticket_id = ticket.ticket_id
                LEFT JOIN "SecurityConcernDetails" AS security_details
                    ON security_details.ticket_id = ticket.ticket_id
                LEFT JOIN "ITSupportDetails" AS it_details
                    ON it_details.ticket_id = ticket.ticket_id
                LEFT JOIN "MaintenanceDetails" AS maintenance_details
                    ON maintenance_details.ticket_id = ticket.ticket_id
                LEFT JOIN "LostPropertyDetails" AS lost_property_details
                    ON lost_property_details.ticket_id = ticket.ticket_id
                LEFT JOIN "GeneralRequestDetails" AS general_details
                    ON general_details.ticket_id = ticket.ticket_id
                LEFT JOIN "FacilityFaultDetails" AS facility_fault_details
                    ON facility_fault_details.ticket_id = ticket.ticket_id
                WHERE ticket.citizen_id = $1
            ), metrics AS (
                SELECT
                    COUNT(*)::int AS total_tickets,
                    COUNT(*) FILTER (
                        WHERE status IN ('Submitted', 'Assigned', 'In_Progress')
                    )::int AS active_tickets,
                    COUNT(*) FILTER (
                        WHERE status IN ('Resolved', 'Closed')
                    )::int AS completed_tickets,
                    COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected_tickets,
                    COUNT(*) FILTER (
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                    )::int AS recent_tickets,
                    MAX(updated_at) AS last_activity_at
                FROM scoped_tickets
            ), history AS (
                SELECT COALESCE(
                    json_agg(to_jsonb(history_rows) ORDER BY history_rows.created_at DESC),
                    '[]'::json
                ) AS tickets
                FROM (
                    SELECT *
                    FROM scoped_tickets
                    ORDER BY created_at DESC
                ) AS history_rows
            )
            SELECT metrics.*, history.tickets
            FROM metrics CROSS JOIN history
            `,
            [userId]
        );

        return res.status(200).json({
            success: true,
            dashboard: result.rows[0]
        });
    } catch (error) {
        console.error("Requester dashboard lookup failed:", error);
        return res.status(500).json({
            success: false,
            message: "Your service requests could not be loaded. Please try again."
        });
    }
});

router.post("/", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return res.status(401).json({
            success: false,
            message: "Sign in before submitting a service request."
        });
    }

    if (!isRecord(req.body) || typeof req.body.requestType !== "string") {
        return res.status(400).json({
            success: false,
            message: "The request type or submitted details are invalid."
        });
    }
    const config = requestTypes[req.body.requestType];
    const fields = config ? parseFields(req.body.details, config) : null;
    if (!config || !fields) {
        return res.status(400).json({
            success: false,
            message: "Check the request details and try submitting again."
        });
    }
    if (
        req.body.requestType === "lost-property" &&
        (typeof fields.dateTime !== "string" || !Number.isFinite(Date.parse(fields.dateTime)))
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid date and estimated time for the lost or found item."
        });
    }
    if (typeof fields.locationLatitude === "number" && typeof fields.locationLongitude !== "number") {
        return res.status(400).json({
            success: false,
            message: "The selected map location is incomplete. Choose it on the map again."
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
                message: "Your account is unavailable. Sign in again before submitting a request."
            });
        }

        const ticket = await createTicket(client, {
            citizenId: userId,
            categoryName: config.categoryName,
            slaHours: config.slaHours,
            trackingCode: config.trackingCode,
            description: getTicketDescription(req.body.requestType, fields)
        });
        await saveRequestDetails(client, ticket.ticket_id, req.body.requestType, fields);

        await client.query("COMMIT");
        return res.status(201).json({
            success: true,
            message: "Service request submitted.",
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
                console.error("Service request transaction rollback failed:", rollbackError);
            }
        }
        console.error("Service request submission failed:", error);
        return res.status(500).json({
            success: false,
            message: "The service request could not be saved. Please try again."
        });
    } finally {
        client?.release();
    }
});

export default router;
