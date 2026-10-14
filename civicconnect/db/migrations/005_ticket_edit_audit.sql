BEGIN;

CREATE TABLE IF NOT EXISTS "TicketEditAudit" (
    edit_log_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,
    actor_id INT NOT NULL,
    previous_details JSONB NOT NULL,
    new_details JSONB NOT NULL,
    changed_fields JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (edit_log_id),
    CONSTRAINT fk_ticket_edit_audit_ticket
        FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_edit_audit_actor
        FOREIGN KEY (actor_id) REFERENCES "User" (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_ticket_edit_audit_previous_object
        CHECK (jsonb_typeof(previous_details) = 'object'),
    CONSTRAINT chk_ticket_edit_audit_new_object
        CHECK (jsonb_typeof(new_details) = 'object'),
    CONSTRAINT chk_ticket_edit_audit_changed_fields_array
        CHECK (jsonb_typeof(changed_fields) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_ticket_edit_audit_ticket_timestamp
    ON "TicketEditAudit" (ticket_id, timestamp DESC);

COMMIT;
