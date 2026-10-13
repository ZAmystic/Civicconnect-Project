BEGIN;

INSERT INTO "ServiceCategory" (category_name, sla_hours)
VALUES ('Facility Faults', 48)
ON CONFLICT (category_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS "FacilityFaultDetails" (
    ticket_id BIGINT NOT NULL,
    facility_address VARCHAR(300) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    fault_classification VARCHAR(20) NOT NULL,
    urgency VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_facility_fault_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_facility_fault_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_facility_fault_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_facility_fault_latitude
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_facility_fault_longitude
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_facility_fault_classification
        CHECK (fault_classification IN ('plumbing', 'hvac', 'elevator', 'structural', 'roof', 'electrical')),
    CONSTRAINT chk_facility_fault_urgency
        CHECK (urgency IN ('routine', 'moderate', 'critical'))
);

COMMIT;
