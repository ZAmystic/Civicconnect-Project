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
    cancelled_tickets: number;
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
        request_type: string | null;
        editable_fields: EditableField[];
    }>;
}

type ParsedFields = Record<string, string | number | boolean | null>;

interface EditableField {
    name: string;
    kind: FieldRule["kind"];
    required?: boolean;
    maxLength?: number;
    values?: readonly string[];
    minimum?: number;
    maximum?: number;
}

interface EditTicketRow {
    ticket_id: string;
    category_name: string;
    description: string;
    status: string;
    updated_at: string;
    details: Record<string, unknown> | null;
}

interface UpdatedTicketRow {
    updated_at: string;
}

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

const facilityFaultConfig: RequestTypeConfig = {
    categoryName: "Facility Faults",
    trackingCode: "F",
    slaHours: 48,
    fields: {
        facilityAddress: { kind: "text", required: true, maxLength: 300 },
        latitude: { kind: "coordinate", minimum: -90, maximum: 90 },
        longitude: { kind: "coordinate", minimum: -180, maximum: 180 },
        faultClassification: {
            kind: "text",
            required: true,
            maxLength: 20,
            values: ["plumbing", "hvac", "elevator", "structural", "roof", "electrical"]
        },
        urgency: {
            kind: "text",
            required: true,
            maxLength: 20,
            values: ["routine", "moderate", "critical"]
        },
        incidentDescription: { kind: "text", required: true, maxLength: 3000 }
    }
};

function getRequestConfig(categoryName: string): RequestTypeConfig | undefined {
    if (categoryName === facilityFaultConfig.categoryName) {
        return facilityFaultConfig;
    }
    return Object.values(requestTypes).find((config) => config.categoryName === categoryName);
}

function getRequestType(config: RequestTypeConfig): string {
    if (config === facilityFaultConfig) {
        return "facility-fault";
    }
    const entry = Object.entries(requestTypes).find(([, value]) => value === config);
    return entry?.[0] ?? "";
}

function getEditableFields(config: RequestTypeConfig): EditableField[] {
    return Object.entries(config.fields).map(([name, rule]) => ({
        name,
        kind: rule.kind,
        ...("required" in rule ? { required: rule.required } : {}),
        ...("maxLength" in rule ? { maxLength: rule.maxLength } : {}),
        ...("values" in rule && rule.values ? { values: rule.values } : {}),
        ...(rule.kind === "coordinate"
            ? { minimum: rule.minimum, maximum: rule.maximum }
            : {})
    })).filter((field) => !/location|latitude|longitude/i.test(field.name));
}

function getEditableRequestConfig(config: RequestTypeConfig): RequestTypeConfig {
    return {
        ...config,
        fields: Object.fromEntries(
            Object.entries(config.fields).filter(([name]) =>
                !/location|latitude|longitude/i.test(name)
            )
        )
    };
}

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
            const coordinate = typeof input === "number"
                ? input
                : typeof input === "string" && input.trim()
                    ? Number(input)
                    : Number.NaN;
            if (
                !Number.isFinite(coordinate) ||
                coordinate < rule.minimum ||
                coordinate > rule.maximum
            ) {
                return null;
            }
            parsed[name] = coordinate;
        } else if (rule.kind === "text-list") {
            const selections: unknown[] = input === undefined || input === null || input === ""
                ? []
                : Array.isArray(input)
                    ? input
                    : typeof input === "string"
                        ? input.split(/;\s*/)
                        : [input];
            const validSelections = selections.filter((selection): selection is string =>
                typeof selection === "string" &&
                rule.values.some((allowed) => allowed === selection)
            );
            if (
                (rule.required && validSelections.length === 0) ||
                validSelections.length !== selections.length
            ) {
                return null;
            }
            parsed[name] = validSelections.join("; ");
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

    for (const [latitudeName, longitudeName] of [
        ["locationLatitude", "locationLongitude"],
        ["latitude", "longitude"]
    ]) {
        const latitude = parsed[latitudeName];
        const longitude = parsed[longitudeName];
        if ((latitude === null) !== (longitude === null)) {
            return null;
        }
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
    const description = requestType === "facility-fault"
        ? fields.incidentDescription
        : fields.description;
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

const ticketDetailJoinsSql = `
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
`;

const normalizedTicketDetailsSql = `
    COALESCE(
        CASE WHEN damaged_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'equipmentType', damaged_details.equipment_type,
            'assetId', damaged_details.asset_id,
            'location', damaged_details.location,
            'locationLatitude', damaged_details.latitude,
            'locationLongitude', damaged_details.longitude,
            'damageType', to_jsonb(string_to_array(NULLIF(damaged_details.damage_types, ''), '; ')),
            'operationalStatus', damaged_details.operational_status,
            'description', damaged_details.description
        ) END,
        CASE WHEN security_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'concernType', security_details.concern_type,
            'location', security_details.location,
            'locationLatitude', security_details.latitude,
            'locationLongitude', security_details.longitude,
            'frequency', security_details.frequency,
            'lighting', security_details.lighting,
            'immediateThreat', security_details.immediate_threat,
            'description', security_details.description
        ) END,
        CASE WHEN it_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'systemAffected', it_details.system_affected,
            'deviceId', it_details.device_id,
            'issueType', it_details.issue_type,
            'errorCode', it_details.error_message,
            'description', it_details.description
        ) END,
        CASE WHEN maintenance_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'maintenanceType', maintenance_details.maintenance_type,
            'location', maintenance_details.location,
            'locationLatitude', maintenance_details.latitude,
            'locationLongitude', maintenance_details.longitude,
            'severity', maintenance_details.severity,
            'utilityInvolvement', to_jsonb(string_to_array(NULLIF(maintenance_details.utility_involvement, ''), '; ')),
            'estimatedSize', maintenance_details.estimated_size,
            'description', maintenance_details.description
        ) END,
        CASE WHEN lost_property_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'reportingMode', lost_property_details.reporting_mode,
            'itemCategory', lost_property_details.item_category,
            'dateTime', lost_property_details.occurred_at,
            'location', lost_property_details.location,
            'locationLatitude', lost_property_details.latitude,
            'locationLongitude', lost_property_details.longitude,
            'description', lost_property_details.description
        ) END,
        CASE WHEN general_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'topic', general_details.topic,
            'departmentSuggestion', general_details.department_suggestion,
            'urgency', general_details.urgency,
            'details', general_details.additional_details
        ) END,
        CASE WHEN facility_fault_details.ticket_id IS NOT NULL THEN jsonb_build_object(
            'facilityAddress', facility_fault_details.facility_address,
            'latitude', facility_fault_details.latitude,
            'longitude', facility_fault_details.longitude,
            'faultClassification', facility_fault_details.fault_classification,
            'urgency', facility_fault_details.urgency,
            'incidentDescription', ticket.description
        ) END
    )
`;

function getAuditableDetails(
    fields: Record<string, unknown>,
    config: RequestTypeConfig
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(config.fields).map(([name, rule]) => {
            const value = fields[name];
            if (rule.kind === "text-list") {
                if (Array.isArray(value)) {
                    return [name, value.filter((item): item is string => typeof item === "string")];
                }
                return [name, typeof value === "string" && value ? value.split("; ") : []];
            }
            if (rule.kind === "text" && value === null) {
                return [name, ""];
            }
            return [name, value];
        })
    );
}

async function updateRequestDetails(
    client: PoolClient,
    ticketId: string,
    requestType: string,
    fields: ParsedFields
): Promise<void> {
    const updateTypedDetails = async (
        sql: string,
        values: Array<string | number | boolean | null>
    ): Promise<void> => {
        const result = await client.query(sql, values);
        if (result.rowCount !== 1) {
            throw new Error("The typed request details could not be found for editing.");
        }
    };

    switch (requestType) {
        case "damaged-equipment":
            await updateTypedDetails(
                `UPDATE "DamagedEquipmentDetails" SET
                    equipment_type = $2, asset_id = $3, location = $4,
                    latitude = $5, longitude = $6, damage_types = $7,
                    operational_status = $8, description = $9
                 WHERE ticket_id = $1`,
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
            await updateTypedDetails(
                `UPDATE "SecurityConcernDetails" SET
                    concern_type = $2, location = $3, latitude = $4, longitude = $5,
                    frequency = $6, lighting = $7, immediate_threat = $8, description = $9
                 WHERE ticket_id = $1`,
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
            await updateTypedDetails(
                `UPDATE "ITSupportDetails" SET
                    system_affected = $2, device_id = $3, issue_type = $4,
                    error_message = $5, description = $6
                 WHERE ticket_id = $1`,
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
            await updateTypedDetails(
                `UPDATE "MaintenanceDetails" SET
                    maintenance_type = $2, location = $3, latitude = $4, longitude = $5,
                    severity = $6, utility_involvement = $7, estimated_size = $8, description = $9
                 WHERE ticket_id = $1`,
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
            await updateTypedDetails(
                `UPDATE "LostPropertyDetails" SET
                    reporting_mode = $2, item_category = $3, occurred_at = $4::TIMESTAMP,
                    location = $5, latitude = $6, longitude = $7, description = $8
                 WHERE ticket_id = $1`,
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
            await updateTypedDetails(
                `UPDATE "GeneralRequestDetails" SET
                    topic = $2, department_suggestion = NULLIF($3, ''),
                    urgency = $4, additional_details = $5
                 WHERE ticket_id = $1`,
                [
                    ticketId,
                    getStringField(fields, "topic"),
                    getStringField(fields, "departmentSuggestion"),
                    getStringField(fields, "urgency"),
                    getStringField(fields, "details")
                ]
            );
            return;
        case "facility-fault":
            await updateTypedDetails(
                `UPDATE "FacilityFaultDetails" SET
                    facility_address = $2, latitude = $3, longitude = $4,
                    fault_classification = $5, urgency = $6
                 WHERE ticket_id = $1`,
                [
                    ticketId,
                    getStringField(fields, "facilityAddress"),
                    getCoordinateField(fields, "latitude"),
                    getCoordinateField(fields, "longitude"),
                    getStringField(fields, "faultClassification"),
                    getStringField(fields, "urgency")
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
                    ${normalizedTicketDetailsSql} AS details
                FROM "Ticket" AS ticket
                JOIN "ServiceCategory" AS category USING (category_id)
                ${ticketDetailJoinsSql}
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
                    COUNT(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled_tickets,
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

        const dashboard = result.rows[0];
        if (dashboard) {
            dashboard.tickets = dashboard.tickets.map((ticket) => {
                const config = getRequestConfig(ticket.category_name);
                return {
                    ...ticket,
                    request_type: config ? getRequestType(config) : null,
                    editable_fields: config ? getEditableFields(config) : []
                };
            });
        }
        return res.status(200).json({
            success: true,
            dashboard
        });
    } catch (error) {
        console.error("Requester dashboard lookup failed:", error);
        return res.status(500).json({
            success: false,
            message: "Your service requests could not be loaded. Please try again."
        });
    }
});

router.put("/:ticketId", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return res.status(401).json({
            success: false,
            message: "Sign in before editing a service request."
        });
    }

    const ticketId = req.params.ticketId;
    if (
        typeof ticketId !== "string" ||
        !/^[1-9]\d{0,18}$/.test(ticketId) ||
        BigInt(ticketId) > 9_223_372_036_854_775_807n
    ) {
        return res.status(400).json({
            success: false,
            message: "The service request reference is invalid."
        });
    }
    if (!isRecord(req.body) || !isRecord(req.body.details)) {
        return res.status(400).json({
            success: false,
            message: "Check the request details and try saving again."
        });
    }

    let client: PoolClient | undefined;
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
                message: "Your account is unavailable. Sign in again before editing a request."
            });
        }

        const ticketResult = await client.query<EditTicketRow>(
            `
            SELECT
                ticket.ticket_id::text AS ticket_id,
                category.category_name,
                ticket.description,
                ticket.status,
                ticket.updated_at,
                ${normalizedTicketDetailsSql} AS details
            FROM "Ticket" AS ticket
            JOIN "ServiceCategory" AS category USING (category_id)
            ${ticketDetailJoinsSql}
            WHERE ticket.ticket_id = $1 AND ticket.citizen_id = $2
            FOR UPDATE OF ticket
            `,
            [ticketId, userId]
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "That service request could not be found."
            });
        }
        if (ticket.status !== "Submitted") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "This request can no longer be edited because it has moved beyond the Submitted stage."
            });
        }

        const config = getRequestConfig(ticket.category_name);
        const requestType = config ? getRequestType(config) : "";
        const editableConfig = config ? getEditableRequestConfig(config) : null;
        const submittedEditableFields = editableConfig
            ? parseFields(req.body.details, editableConfig)
            : null;
        const fields = config && submittedEditableFields && ticket.details
            ? parseFields({ ...ticket.details, ...submittedEditableFields }, config)
            : null;
        if (!config || !fields || !ticket.details) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "These request details are unavailable or invalid. Check the fields and try again."
            });
        }
        if (
            requestType === "lost-property" &&
            (typeof fields.dateTime !== "string" || !Number.isFinite(Date.parse(fields.dateTime)))
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "Enter a valid date and estimated time for the lost or found item."
            });
        }

        const currentDetails = ticket.details;
        const previousAuditDetails = getAuditableDetails(currentDetails, config);
        const updatedAuditDetails = getAuditableDetails(fields, config);
        const changedFields = Object.keys(config.fields).filter((name) =>
            JSON.stringify(previousAuditDetails[name]) !== JSON.stringify(updatedAuditDetails[name])
        );
        if (changedFields.length === 0) {
            await client.query("ROLLBACK");
            return res.status(200).json({
                success: true,
                message: "No changes were made.",
                ticket: {
                    ticket_id: ticket.ticket_id,
                    description: ticket.description,
                    updated_at: ticket.updated_at,
                    details: currentDetails
                }
            });
        }

        await updateRequestDetails(client, ticket.ticket_id, requestType, fields);
        const description = getTicketDescription(requestType, fields);
        const updatedResult = await client.query<UpdatedTicketRow>(
            `
            UPDATE "Ticket"
            SET description = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE ticket_id = $2 AND citizen_id = $3 AND status = 'Submitted'
            RETURNING updated_at
            `,
            [description, ticket.ticket_id, userId]
        );
        const updatedTicket = updatedResult.rows[0];
        if (!updatedTicket) {
            throw new Error("The request could not be updated while it was still submitted.");
        }

        const changedFieldsJson = JSON.stringify(changedFields);
        await client.query("SAVEPOINT detailed_edit_audit");
        try {
            await client.query(
                `
                INSERT INTO "TicketEditAudit" (
                    ticket_id, actor_id, previous_details, new_details, changed_fields
                )
                VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
                `,
                [
                    ticket.ticket_id,
                    userId,
                    JSON.stringify(previousAuditDetails),
                    JSON.stringify(updatedAuditDetails),
                    changedFieldsJson
                ]
            );
            await client.query("RELEASE SAVEPOINT detailed_edit_audit");
        } catch (error) {
            if (
                typeof error !== "object" ||
                error === null ||
                !("code" in error) ||
                error.code !== "42P01"
            ) {
                throw error;
            }
            await client.query("ROLLBACK TO SAVEPOINT detailed_edit_audit");
            await client.query("RELEASE SAVEPOINT detailed_edit_audit");
            console.warn(
                'Detailed request edit snapshots are unavailable because "TicketEditAudit" has not been migrated.'
            );
        }
        const changedFieldLabels = changedFields.map((name) =>
            name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ")
        );
        const changeReason = `Requester edited submitted request details: ${changedFieldLabels.join(", ")}`;
        await client.query(
            `
            INSERT INTO "AuditLog" (
                ticket_id, actor_id, previous_status, new_status, change_reason
            )
            VALUES ($1, $2, 'Submitted', 'Submitted', $3)
            `,
            [ticket.ticket_id, userId, changeReason.slice(0, 255)]
        );

        await client.query("COMMIT");
        return res.status(200).json({
            success: true,
            message: "Your changes were saved and recorded in the audit log.",
            ticket: {
                ticket_id: ticket.ticket_id,
                description,
                updated_at: updatedTicket.updated_at,
                details: updatedAuditDetails
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Service request edit rollback failed:", rollbackError);
            }
        }
        console.error("Service request edit failed:", error);
        return res.status(500).json({
            success: false,
            message: "Your changes could not be saved. Please try again."
        });
    } finally {
        client?.release();
    }
});

router.post("/:ticketId/cancel", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (userId === null) {
        return res.status(401).json({
            success: false,
            message: "Sign in before cancelling a service request."
        });
    }

    const ticketId = req.params.ticketId;
    if (
        typeof ticketId !== "string" ||
        !/^[1-9]\d{0,18}$/.test(ticketId) ||
        BigInt(ticketId) > 9_223_372_036_854_775_807n
    ) {
        return res.status(400).json({
            success: false,
            message: "The service request reference is invalid."
        });
    }

    let client: PoolClient | undefined;
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
                message: "Your account is unavailable. Sign in again before cancelling a request."
            });
        }

        const ticketResult = await client.query<EditTicketRow>(
            `
            SELECT
                ticket.ticket_id::text AS ticket_id,
                category.category_name,
                ticket.description,
                ticket.status,
                ticket.updated_at,
                NULL::jsonb AS details
            FROM "Ticket" AS ticket
            JOIN "ServiceCategory" AS category USING (category_id)
            WHERE ticket.ticket_id = $1 AND ticket.citizen_id = $2
            FOR UPDATE OF ticket
            `,
            [ticketId, userId]
        );
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "That service request could not be found."
            });
        }
        if (ticket.status !== "Submitted") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "This request can only be cancelled while it is still Submitted."
            });
        }

        const updatedResult = await client.query<UpdatedTicketRow>(
            `
            UPDATE "Ticket"
            SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE ticket_id = $1 AND citizen_id = $2 AND status = 'Submitted'
            RETURNING updated_at
            `,
            [ticket.ticket_id, userId]
        );
        const updatedTicket = updatedResult.rows[0];
        if (!updatedTicket) {
            throw new Error("The request could not be cancelled while it was still submitted.");
        }

        await client.query(
            `
            INSERT INTO "AuditLog" (
                ticket_id, actor_id, previous_status, new_status, change_reason
            )
            VALUES ($1, $2, 'Submitted', 'Cancelled', 'Requester cancelled the request before review.')
            `,
            [ticket.ticket_id, userId]
        );
        await client.query("COMMIT");
        return res.status(200).json({
            success: true,
            message: "Your request was cancelled and recorded in the audit log.",
            ticket: {
                ticket_id: ticket.ticket_id,
                status: "Cancelled",
                updated_at: updatedTicket.updated_at
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Service request cancellation rollback failed:", rollbackError);
            }
        }
        console.error("Service request cancellation failed:", error);
        return res.status(500).json({
            success: false,
            message: "Your request could not be cancelled. Please try again."
        });
    } finally {
        client?.release();
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
