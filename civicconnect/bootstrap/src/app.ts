// src/app.ts
// Core Express application shell (Sub-Task 1.5, Member 1).
// Wires cross-cutting middleware and mounts each module's routes.
// Module route files (request-management, notification-admin, etc.) are
// added here by their owning members as they are implemented - this file
// intentionally does not contain business logic itself.

import express, { Express } from "express";
import { healthRouter } from "./routes/health.route";

export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Health/readiness probes are mounted first and unauthenticated - an
  // orchestrator must be able to reach them regardless of auth state.
  app.use(healthRouter);

  // TODO (Member 2): mount request-management routes behind auth middleware
  // TODO (Member 3): mount API routes per openapi.yaml, auth middleware, contractor routes

  return app;
}
