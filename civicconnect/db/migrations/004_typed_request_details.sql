BEGIN;

CREATE TABLE IF NOT EXISTS "DamagedEquipmentDetails" (
    ticket_id BIGINT NOT NULL,
    equipment_type VARCHAR(80) NOT NULL,
    asset_id VARCHAR(80) NOT NULL DEFAULT '',
    location VARCHAR(300) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    damage_types VARCHAR(500) NOT NULL,
    operational_status VARCHAR(40) NOT NULL,
    description VARCHAR(3000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_damaged_equipment_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_damaged_equipment_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_damaged_equipment_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_damaged_equipment_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_damaged_equipment_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS "SecurityConcernDetails" (
    ticket_id BIGINT NOT NULL,
    concern_type VARCHAR(80) NOT NULL,
    location VARCHAR(300) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    frequency VARCHAR(20) NOT NULL,
    lighting VARCHAR(20) NOT NULL,
    immediate_threat BOOLEAN NOT NULL DEFAULT FALSE,
    description VARCHAR(3000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_security_concern_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_security_concern_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_security_concern_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_security_concern_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_security_concern_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS "ITSupportDetails" (
    ticket_id BIGINT NOT NULL,
    system_affected VARCHAR(80) NOT NULL,
    device_id VARCHAR(100) NOT NULL DEFAULT '',
    issue_type VARCHAR(80) NOT NULL,
    error_message VARCHAR(300) NOT NULL DEFAULT '',
    description VARCHAR(3000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_it_support_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_it_support_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceDetails" (
    ticket_id BIGINT NOT NULL,
    maintenance_type VARCHAR(100) NOT NULL,
    location VARCHAR(300) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    severity VARCHAR(30) NOT NULL,
    utility_involvement VARCHAR(300) NOT NULL DEFAULT '',
    estimated_size VARCHAR(30) NOT NULL,
    description VARCHAR(3000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_maintenance_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_maintenance_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_maintenance_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_maintenance_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_maintenance_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS "LostPropertyDetails" (
    ticket_id BIGINT NOT NULL,
    reporting_mode VARCHAR(10) NOT NULL,
    item_category VARCHAR(50) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    location VARCHAR(300) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    description VARCHAR(3000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_lost_property_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_lost_property_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_lost_property_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_lost_property_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_lost_property_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS "GeneralRequestDetails" (
    ticket_id BIGINT NOT NULL,
    topic VARCHAR(160) NOT NULL,
    department_suggestion VARCHAR(40),
    urgency VARCHAR(20) NOT NULL,
    additional_details VARCHAR(3000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_general_request_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_general_request_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $migration$
BEGIN
    IF to_regclass('"ServiceRequestDetails"') IS NOT NULL THEN
INSERT INTO "DamagedEquipmentDetails" (
    ticket_id, equipment_type, asset_id, location, latitude, longitude,
    damage_types, operational_status, description, created_at
)
SELECT
    ticket_id,
    details->>'equipmentType',
    COALESCE(details->>'assetId', ''),
    details->>'location',
    CASE WHEN details->>'locationLatitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLatitude')::NUMERIC ELSE NULL END,
    CASE WHEN details->>'locationLongitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLongitude')::NUMERIC ELSE NULL END,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(details->'damageType')), '; '),
    details->>'operationalStatus',
    details->>'description',
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'damaged-equipment'
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO "SecurityConcernDetails" (
    ticket_id, concern_type, location, latitude, longitude, frequency,
    lighting, immediate_threat, description, created_at
)
SELECT
    ticket_id,
    details->>'concernType',
    details->>'location',
    CASE WHEN details->>'locationLatitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLatitude')::NUMERIC ELSE NULL END,
    CASE WHEN details->>'locationLongitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLongitude')::NUMERIC ELSE NULL END,
    details->>'frequency',
    details->>'lighting',
    COALESCE((details->>'immediateThreat')::BOOLEAN, FALSE),
    details->>'description',
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'security-concerns'
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO "ITSupportDetails" (
    ticket_id, system_affected, device_id, issue_type, error_message, description, created_at
)
SELECT
    ticket_id,
    details->>'systemAffected',
    COALESCE(details->>'deviceId', ''),
    details->>'issueType',
    COALESCE(details->>'errorCode', ''),
    details->>'description',
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'it-support'
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO "MaintenanceDetails" (
    ticket_id, maintenance_type, location, latitude, longitude, severity,
    utility_involvement, estimated_size, description, created_at
)
SELECT
    ticket_id,
    details->>'maintenanceType',
    details->>'location',
    CASE WHEN details->>'locationLatitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLatitude')::NUMERIC ELSE NULL END,
    CASE WHEN details->>'locationLongitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLongitude')::NUMERIC ELSE NULL END,
    details->>'severity',
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(details->'utilityInvolvement')), '; '),
    details->>'estimatedSize',
    details->>'description',
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'maintenance'
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO "LostPropertyDetails" (
    ticket_id, reporting_mode, item_category, occurred_at, location,
    latitude, longitude, description, created_at
)
SELECT
    ticket_id,
    details->>'reportingMode',
    details->>'itemCategory',
    CASE
        WHEN details->>'dateTime' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?$'
            THEN (details->>'dateTime')::TIMESTAMP
        ELSE created_at
    END,
    details->>'location',
    CASE WHEN details->>'locationLatitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLatitude')::NUMERIC ELSE NULL END,
    CASE WHEN details->>'locationLongitude' ~ '^-?[0-9]+([.][0-9]+)?$'
        THEN (details->>'locationLongitude')::NUMERIC ELSE NULL END,
    details->>'description',
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'lost-property'
ON CONFLICT (ticket_id) DO NOTHING;

INSERT INTO "GeneralRequestDetails" (
    ticket_id, topic, department_suggestion, urgency, additional_details, created_at
)
SELECT
    ticket_id,
    details->>'topic',
    NULLIF(details->>'departmentSuggestion', ''),
    details->>'urgency',
    COALESCE(details->>'details', ''),
    created_at
FROM "ServiceRequestDetails"
WHERE request_type = 'general-request'
ON CONFLICT (ticket_id) DO NOTHING;

    END IF;
END
$migration$;

COMMIT;
