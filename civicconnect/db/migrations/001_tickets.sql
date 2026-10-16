-- =============================================================================
-- CivicConnect PostgreSQL Database Schema Migration
-- Migration Script: 001_tickets.sql (Updated)
-- Module: Core Data & Persistence Layer 
-- Purpose: Builds the foundational database structure including expanded 
--          request type details and updated constraints.
-- =============================================================================

-- =============================================================================
-- 1. User Table (Identities & Roles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "User" (
    user_id SERIAL NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    full_surname VARCHAR(100) NOT NULL,
    account_status BOOLEAN NOT NULL DEFAULT TRUE,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Citizen',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT uk_user_email UNIQUE (email),
    CONSTRAINT chk_user_role CHECK (role IN ('Citizen', 'Staff', 'Manager', 'Contractor', 'Admin'))
);

-- =============================================================================
-- 2. ServiceCategory Table (Controlled Lookups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ServiceCategory" (
    category_id SERIAL NOT NULL,
    category_name VARCHAR(50) NOT NULL,
    sla_hours INT NOT NULL DEFAULT 48,
    PRIMARY KEY (category_id),
    CONSTRAINT uk_category_name UNIQUE (category_name),
    CONSTRAINT chk_sla_positive CHECK (sla_hours > 0)
);

-- =============================================================================
-- 3. Ticket Table (Core Aggregate Root)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "Ticket" (
    ticket_id BIGSERIAL NOT NULL,
    tracking_ref VARCHAR(20) NOT NULL,
    citizen_id INT NOT NULL,
    category_id INT NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Submitted',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT uk_ticket_tracking_ref UNIQUE (tracking_ref),
    -- Ticket statuses updated to include 'Cancelled'
    CONSTRAINT chk_ticket_status CHECK (status IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected', 'Cancelled')),
    CONSTRAINT chk_ticket_version CHECK (version >= 1),
    CONSTRAINT fk_ticket_citizen FOREIGN KEY (citizen_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_category FOREIGN KEY (category_id) REFERENCES "ServiceCategory" (category_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- 4. AuditLog Table (Immutable Audit Trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AuditLog" (
    log_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,
    actor_id INT NOT NULL,
    previous_status VARCHAR(20) NULL DEFAULT NULL,
    new_status VARCHAR(20) NOT NULL,
    change_reason VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    CONSTRAINT chk_audit_new_status CHECK (new_status IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected', 'Cancelled')),
    CONSTRAINT fk_audit_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- 5. ContractorAssignment Table (External Dispatch)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ContractorAssignment" (
    assignment_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,
    contractor_user_id INT NOT NULL,
    assigned_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completion_status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    PRIMARY KEY (assignment_id),
    CONSTRAINT chk_contractor_status CHECK (completion_status IN ('Pending', 'In_Transit', 'Completed', 'Failed')),
    CONSTRAINT fk_assignment_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_assignment_contractor FOREIGN KEY (contractor_user_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- Expanded Request Detail Tables (Polymorphic Ticket Details)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "FacilityFaultDetails" (
    ticket_id BIGINT NOT NULL,
    facility_address VARCHAR NOT NULL,
    latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
    fault_classification VARCHAR NOT NULL CHECK (fault_classification IN ('plumbing', 'hvac', 'elevator', 'structural', 'roof', 'electrical')),
    urgency VARCHAR NOT NULL CHECK (urgency IN ('routine', 'moderate', 'critical')),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_facility_fault_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DamagedEquipmentDetails" (
    ticket_id BIGINT NOT NULL,
    equipment_type VARCHAR NOT NULL,
    asset_id VARCHAR NOT NULL DEFAULT '',
    location VARCHAR NOT NULL,
    latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
    damage_types VARCHAR NOT NULL,
    operational_status VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_damaged_equipment_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SecurityConcernDetails" (
    ticket_id BIGINT NOT NULL,
    concern_type VARCHAR NOT NULL,
    location VARCHAR NOT NULL,
    latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
    frequency VARCHAR NOT NULL,
    lighting VARCHAR NOT NULL,
    immediate_threat BOOLEAN NOT NULL DEFAULT false,
    description VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_security_concern_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ITSupportDetails" (
    ticket_id BIGINT NOT NULL,
    system_affected VARCHAR NOT NULL,
    device_id VARCHAR NOT NULL DEFAULT '',
    issue_type VARCHAR NOT NULL,
    error_message VARCHAR NOT NULL DEFAULT '',
    description VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_it_support_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MaintenanceDetails" (
    ticket_id BIGINT NOT NULL,
    maintenance_type VARCHAR NOT NULL,
    location VARCHAR NOT NULL,
    latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
    severity VARCHAR NOT NULL,
    utility_involvement VARCHAR NOT NULL DEFAULT '',
    estimated_size VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_maintenance_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LostPropertyDetails" (
    ticket_id BIGINT NOT NULL,
    reporting_mode VARCHAR NOT NULL,
    item_category VARCHAR NOT NULL,
    occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    location VARCHAR NOT NULL,
    latitude NUMERIC CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
    longitude NUMERIC CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
    description VARCHAR NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_lost_property_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GeneralRequestDetails" (
    ticket_id BIGINT NOT NULL,
    topic VARCHAR NOT NULL,
    department_suggestion VARCHAR,
    urgency VARCHAR NOT NULL,
    additional_details VARCHAR NOT NULL DEFAULT '',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_general_request_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- Ticket Edit Audit Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS "TicketEditAudit" (
    edit_log_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,
    actor_id INT NOT NULL,
    previous_details JSONB NOT NULL CHECK (jsonb_typeof(previous_details) = 'object'),
    new_details JSONB NOT NULL CHECK (jsonb_typeof(new_details) = 'object'),
    changed_fields JSONB NOT NULL CHECK (jsonb_typeof(changed_fields) = 'array'),
    timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (edit_log_id),
    CONSTRAINT fk_ticket_edit_audit_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket"(ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_edit_audit_actor FOREIGN KEY (actor_id) REFERENCES "User"(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================================================
-- Performance Optimization Indexes (B-Tree)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ticket_status ON "Ticket" (status);         
CREATE INDEX IF NOT EXISTS idx_ticket_citizen ON "Ticket" (citizen_id);    
CREATE INDEX IF NOT EXISTS idx_ticket_category ON "Ticket" (category_id);  
CREATE INDEX IF NOT EXISTS idx_audit_ticket ON "AuditLog" (ticket_id);     
CREATE INDEX IF NOT EXISTS idx_contractor_ticket ON "ContractorAssignment" (ticket_id);

-- =============================================================================
-- 6. PostgreSQL Auto-Update Trigger for 'updated_at'
-- =============================================================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_ticket_modtime
    BEFORE UPDATE ON "Ticket"
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();