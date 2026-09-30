/**
 * =============================================================================
 * File: src/services/TicketService.ts
 * Purpose: Core Data Access Layer executing PostgreSQL operations, ACID 
 *          transactions, and Optimistic Concurrency Control (OCC).
 * =============================================================================
 */

import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'civicconnect_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'civicconnect_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export type TicketStatus = 
  | 'Submitted' 
  | 'Assigned' 
  | 'In_Progress' 
  | 'Resolved' 
  | 'Closed' 
  | 'Rejected';

export interface UpdateTicketStatusDTO {
  ticketId: number;
  actorId: number;
  expectedVersion: number;
  newStatus: TicketStatus;
  changeReason: string;
}

export class ConcurrencyException extends Error {
  constructor(
    public readonly ticketId: number, 
    public readonly expectedVersion: number
  ) {
    super(
      `Concurrency conflict on Ticket ID ${ticketId}: Version ${expectedVersion} ` +
      `was modified by another user or background process.`
    );
    this.name = 'ConcurrencyException';
    Object.setPrototypeOf(this, ConcurrencyException.prototype);
  }
}

export async function updateTicketStatusTransaction(
  dto: UpdateTicketStatusDTO
): Promise<{ newVersion: number }> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch current status
    const currentRes = await client.query(
      `SELECT status, version FROM ticket WHERE ticket_id = $1`,
      [dto.ticketId]
    );

    if (currentRes.rows.length === 0) {
      throw new Error(`Ticket with ID ${dto.ticketId} does not exist.`);
    }

    // Correctly access the first row object in the array
    const previousStatus: TicketStatus = currentRes.rows[0].status;

    // 2. Execute OCC update query
    const updateRes = await client.query(
      `UPDATE ticket 
       SET status = $1, version = version + 1 
       WHERE ticket_id = $2 AND version = $3 
       RETURNING version`,
      [dto.newStatus, dto.ticketId, dto.expectedVersion]
    );

    if (updateRes.rowCount === 0) {
      throw new ConcurrencyException(dto.ticketId, dto.expectedVersion);
    }

    // Correctly access the first row object in the array
    const newVersion: number = updateRes.rows[0].version;

    // 3. Append audit log entry in same transaction boundary
    await client.query(
      `INSERT INTO audit_log (ticket_id, actor_id, previous_status, new_status, change_reason) 
       VALUES ($1, $2, $3, $4, $5)`,
      [dto.ticketId, dto.actorId, previousStatus, dto.newStatus, dto.changeReason]
    );

    await client.query('COMMIT');
    return { newVersion };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}