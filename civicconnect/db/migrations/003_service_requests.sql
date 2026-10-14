BEGIN;

INSERT INTO "ServiceCategory" (category_name, sla_hours)
VALUES
    ('Damaged Equipment', 48),
    ('Security Concerns', 24),
    ('IT Support', 48),
    ('Maintenance', 72),
    ('Lost Property', 48),
    ('General Requests', 72)
ON CONFLICT (category_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS "ServiceRequestDetails" (
    ticket_id BIGINT NOT NULL,
    request_type VARCHAR(30) NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_service_request_details PRIMARY KEY (ticket_id),
    CONSTRAINT fk_service_request_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_service_request_type CHECK (
        request_type IN (
            'damaged-equipment',
            'security-concerns',
            'it-support',
            'maintenance',
            'lost-property',
            'general-request'
        )
    ),
    CONSTRAINT chk_service_request_details_object CHECK (jsonb_typeof(details) = 'object')
);

COMMIT;
