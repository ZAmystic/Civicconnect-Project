/**
 * =============================================================================
 * File: src/controllers/TicketController.ts
 * Purpose: Express Route Handler that parses HTTP requests, calls the transaction
 *          service, and maps ConcurrencyExceptions to HTTP 409 Conflict responses.
 * Section: PED 5.3 - API Exception Gateway
 * =============================================================================
 */

import { Request, Response } from 'express';
import {
  updateTicketStatusTransaction,
  ConcurrencyException,
  TicketStatus
} from '../services/TicketService';

export async function handleStatusUpdate(req: Request, res: Response): Promise<Response> {
  try {
    // FIX: Cast req.params.id to string to satisfy TypeScript's strict type checking
    const ticketId = parseInt(req.params.id as string, 10);
    const actorId = (req as any).user?.id;
    const expectedVersion = parseInt(req.body.version as string, 10);
    const newStatus = req.body.status as TicketStatus;
    const changeReason = req.body.reason;

    if (isNaN(ticketId) || isNaN(expectedVersion) || !newStatus || !changeReason) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing or invalid fields: ticketId, version, status, and reason are required.',
      });
    }

    const result = await updateTicketStatusTransaction({
      ticketId,
      actorId,
      expectedVersion,
      newStatus,
      changeReason,
    });

    return res.status(200).json({
      message: 'Ticket status updated successfully.',
      version: result.newVersion,
    });

  } catch (error) {
    // Map OCC write collisions to 409 Conflict for the client UI
    if (error instanceof ConcurrencyException) {
      return res.status(409).json({
        error: 'CONCURRENCY_CONFLICT',
        message: 'This ticket was modified by another staff member while you were editing it. Please refresh and try again.',
        ticketId: error.ticketId,
        expectedVersion: error.expectedVersion,
      });
    }

    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: (error as Error).message,
    });
  }
}