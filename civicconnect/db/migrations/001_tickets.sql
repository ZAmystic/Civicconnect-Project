-- =============================================================================
-- CivicConnect MariaDB Database Schema Migration
-- Migration Script: 001_tickets.sql
-- Module: Core Data & Persistence Layer 
-- Engine: InnoDB | Character Set: utf8mb4 | Collation: utf8mb4_unicode_ci
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. User Table (Identities & Roles)
CREATE TABLE IF NOT EXISTS `User` (
    `user_id` INT AUTO_INCREMENT NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'Citizen',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`),
    CONSTRAINT `uk_user_email` UNIQUE (`email`),
    CONSTRAINT `chk_user_role` CHECK (`role` IN ('Citizen', 'Staff', 'Manager', 'Contractor'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ServiceCategory Table (Controlled Lookups)
CREATE TABLE IF NOT EXISTS `ServiceCategory` (
    `category_id` INT AUTO_INCREMENT NOT NULL,
    `category_name` VARCHAR(50) NOT NULL,
    `sla_hours` INT NOT NULL DEFAULT 48,
    PRIMARY KEY (`category_id`),
    CONSTRAINT `uk_category_name` UNIQUE (`category_name`),
    CONSTRAINT `chk_sla_positive` CHECK (`sla_hours` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ticket Table (Core Aggregate Root with OCC Version Counter)
CREATE TABLE IF NOT EXISTS `Ticket` (
    `ticket_id` BIGINT AUTO_INCREMENT NOT NULL,
    `tracking_ref` VARCHAR(20) NOT NULL,
    `citizen_id` INT NOT NULL,
    `category_id` INT NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'Submitted',
    `version` INT NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`ticket_id`),
    CONSTRAINT `uk_ticket_tracking_ref` UNIQUE (`tracking_ref`),
    CONSTRAINT `chk_ticket_status` CHECK (`status` IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected')),
    CONSTRAINT `chk_ticket_version` CHECK (`version` >= 1),
    CONSTRAINT `fk_ticket_citizen` FOREIGN KEY (`citizen_id`) REFERENCES `User` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_ticket_category` FOREIGN KEY (`category_id`) REFERENCES `ServiceCategory` (`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. AuditLog Table (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS `AuditLog` (
    `log_id` BIGINT AUTO_INCREMENT NOT NULL,
    `ticket_id` BIGINT NOT NULL,
    `actor_id` INT NOT NULL,
    `previous_status` VARCHAR(20) NULL DEFAULT NULL,
    `new_status` VARCHAR(20) NOT NULL,
    `change_reason` VARCHAR(255) NOT NULL,
    `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`log_id`),
    CONSTRAINT `chk_audit_new_status` CHECK (`new_status` IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected')),
    CONSTRAINT `fk_audit_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket` (`ticket_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `User` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. ContractorAssignment Table (External Dispatch Join Entity)
CREATE TABLE IF NOT EXISTS `ContractorAssignment` (
    `assignment_id` BIGINT AUTO_INCREMENT NOT NULL,
    `ticket_id` BIGINT NOT NULL,
    `contractor_user_id` INT NOT NULL,
    `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `completion_status` VARCHAR(20) NOT NULL DEFAULT 'Pending',
    PRIMARY KEY (`assignment_id`),
    CONSTRAINT `chk_contractor_status` CHECK (`completion_status` IN ('Pending', 'In_Transit', 'Completed', 'Failed')),
    CONSTRAINT `fk_assignment_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `Ticket` (`ticket_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_assignment_contractor` FOREIGN KEY (`contractor_user_id`) REFERENCES `User` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Performance Optimization Indexes (B-Tree)
CREATE INDEX `idx_ticket_status` ON `Ticket` (`status`);
CREATE INDEX `idx_ticket_citizen` ON `Ticket` (`citizen_id`);
CREATE INDEX `idx_ticket_category` ON `Ticket` (`category_id`);
CREATE INDEX `idx_audit_ticket` ON `AuditLog` (`ticket_id`);
CREATE INDEX `idx_contractor_ticket` ON `ContractorAssignment` (`ticket_id`);

SET FOREIGN_KEY_CHECKS = 1;
