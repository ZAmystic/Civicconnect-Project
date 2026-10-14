BEGIN;

ALTER TABLE "Ticket"
    DROP CONSTRAINT IF EXISTS chk_ticket_status;

ALTER TABLE "Ticket"
    ADD CONSTRAINT chk_ticket_status
    CHECK (status IN (
        'Submitted',
        'Assigned',
        'In_Progress',
        'Resolved',
        'Closed',
        'Rejected',
        'Cancelled'
    ));

ALTER TABLE "AuditLog"
    DROP CONSTRAINT IF EXISTS chk_audit_new_status;

ALTER TABLE "AuditLog"
    ADD CONSTRAINT chk_audit_new_status
    CHECK (new_status IN (
        'Submitted',
        'Assigned',
        'In_Progress',
        'Resolved',
        'Closed',
        'Rejected',
        'Cancelled'
    ));

COMMIT;
