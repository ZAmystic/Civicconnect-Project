-- =============================================================================
-- CivicConnect PostgreSQL Database Schema Migration
-- Migration Script: 001_tickets.sql
-- Module: Core Data & Persistence Layer 
-- Purpose: This script builds the foundational database structure for the 
--          CivicConnect system. It creates the necessary tables, relationships, 
--          data integrity rules (constraints), and automated triggers.
-- =============================================================================


-- =============================================================================
-- 1. User Table (Identities & Roles)
-- Purpose: Stores all users in the system, regardless of their role. 
--          This acts as the central identity provider for authentication and authorization.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "User" (
    user_id SERIAL NOT NULL,                        -- Auto-incrementing primary key
    full_name VARCHAR(100) NOT NULL,                -- User's display name
    email VARCHAR(150) NOT NULL,                    -- Used for login and notifications
    password_hash VARCHAR(255) NOT NULL,            -- Securely hashed password (never plain text)
    role VARCHAR(20) NOT NULL DEFAULT 'Citizen',    -- Defines system permissions
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- When the account was registered
    PRIMARY KEY (user_id),
    CONSTRAINT uk_user_email UNIQUE (email),        -- Prevents duplicate accounts with the same email
    -- Restricts role values to ensure the backend RBAC (Role-Based Access Control) doesn't break
    CONSTRAINT chk_user_role CHECK (role IN ('Citizen', 'Staff', 'Manager', 'Contractor'))
);


-- =============================================================================
-- 2. ServiceCategory Table (Controlled Lookups)
-- Purpose: Defines the types of issues citizens can report (e.g., 'Water Leak', 'Pothole').
--          Storing these in a table instead of hardcoding them in the app allows
--          managers to add new categories later without changing code.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ServiceCategory" (
    category_id SERIAL NOT NULL,                    
    category_name VARCHAR(50) NOT NULL,             -- e.g., 'Road Maintenance', 'Electricity'
    sla_hours INT NOT NULL DEFAULT 48,              -- Service Level Agreement: How quickly it must be fixed
    PRIMARY KEY (category_id),
    CONSTRAINT uk_category_name UNIQUE (category_name), 
    CONSTRAINT chk_sla_positive CHECK (sla_hours > 0) -- SLA cannot be zero or negative
);


-- =============================================================================
-- 3. Ticket Table (Core Aggregate Root)
-- Purpose: The central entity of the system. Represents a fault or issue logged 
--          by a citizen. All other operational tables link back to this.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "Ticket" (
    ticket_id BIGSERIAL NOT NULL,                   -- BIGSERIAL allows for billions of records
    tracking_ref VARCHAR(20) NOT NULL,              -- A human-readable reference number (e.g., 'TKT-2026-001')
    citizen_id INT NOT NULL,                        -- The user who logged the fault
    category_id INT NOT NULL,                       -- The type of fault
    description TEXT NOT NULL,                      -- Detailed explanation of the issue
    status VARCHAR(20) NOT NULL DEFAULT 'Submitted',-- Current state in the lifecycle
    version INT NOT NULL DEFAULT 1,                 -- Optimistic Concurrency Control (prevents 2 staff from editing at once)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, 
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT uk_ticket_tracking_ref UNIQUE (tracking_ref),
    
    -- Enforces a strict state machine for the ticket lifecycle
    CONSTRAINT chk_ticket_status CHECK (status IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected')),
    CONSTRAINT chk_ticket_version CHECK (version >= 1),
    
    -- Foreign Keys link to other tables. 'ON DELETE RESTRICT' prevents deleting a User/Category if they are tied to a Ticket.
    CONSTRAINT fk_ticket_citizen FOREIGN KEY (citizen_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_category FOREIGN KEY (category_id) REFERENCES "ServiceCategory" (category_id) ON DELETE RESTRICT ON UPDATE CASCADE
);


-- =============================================================================
-- 4. AuditLog Table (Immutable Audit Trail)
-- Purpose: Provides a tamper-proof history of everything that happens to a ticket.
--          If a ticket is rejected or closed, this table proves WHO did it and WHY.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AuditLog" (
    log_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,                      -- Which ticket was modified
    actor_id INT NOT NULL,                          -- The staff/manager user who made the change
    previous_status VARCHAR(20) NULL DEFAULT NULL,  -- What the status was BEFORE the change
    new_status VARCHAR(20) NOT NULL,                -- What the status is AFTER the change
    change_reason VARCHAR(255) NOT NULL,            -- Mandatory explanation for the status change
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Exact time of change
    PRIMARY KEY (log_id),
    CONSTRAINT chk_audit_new_status CHECK (new_status IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected')),
    CONSTRAINT fk_audit_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);


-- =============================================================================
-- 5. ContractorAssignment Table (External Dispatch)
-- Purpose: Connects an external contractor (User) to a specific Ticket.
--          Separating this from the main Ticket table allows a ticket to be 
--          reassigned if the first contractor fails to complete the job.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ContractorAssignment" (
    assignment_id BIGSERIAL NOT NULL,
    ticket_id BIGINT NOT NULL,                      -- The job being dispatched
    contractor_user_id INT NOT NULL,                -- The contractor assigned to it
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completion_status VARCHAR(20) NOT NULL DEFAULT 'Pending', -- Local status for the contractor's specific task
    PRIMARY KEY (assignment_id),
    CONSTRAINT chk_contractor_status CHECK (completion_status IN ('Pending', 'In_Transit', 'Completed', 'Failed')),
    CONSTRAINT fk_assignment_ticket FOREIGN KEY (ticket_id) REFERENCES "Ticket" (ticket_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_assignment_contractor FOREIGN KEY (contractor_user_id) REFERENCES "User" (user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);


-- =============================================================================
-- Performance Optimization Indexes (B-Tree)
-- Purpose: Indexes act like a book's table of contents. Instead of scanning every
--          row in the database (which is slow), PostgreSQL uses these indexes to 
--          instantly find records when filtering by status or foreign keys.
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ticket_status ON "Ticket" (status);         -- Speeds up "Show me all 'Submitted' tickets"
CREATE INDEX IF NOT EXISTS idx_ticket_citizen ON "Ticket" (citizen_id);    -- Speeds up "Show me my ticket history"
CREATE INDEX IF NOT EXISTS idx_ticket_category ON "Ticket" (category_id);  -- Speeds up filtering by category
CREATE INDEX IF NOT EXISTS idx_audit_ticket ON "AuditLog" (ticket_id);     -- Speeds up loading a ticket's history timeline
CREATE INDEX IF NOT EXISTS idx_contractor_ticket ON "ContractorAssignment" (ticket_id);


-- =============================================================================
-- 6. PostgreSQL Auto-Update Trigger for 'updated_at'
-- Purpose: PostgreSQL does not have a native "ON UPDATE CURRENT_TIMESTAMP" 
--          feature like MySQL. Instead, we write a small function (trigger) 
--          that runs automatically every time a row in the Ticket table is updated,
--          forcing the 'updated_at' field to refresh to the exact current time.
-- =============================================================================

-- Create the reusable function that sets the updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Attach the function to the Ticket table
CREATE OR REPLACE TRIGGER update_ticket_modtime
    BEFORE UPDATE ON "Ticket"
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();