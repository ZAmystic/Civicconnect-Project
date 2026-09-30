// src/routes/health.route.ts
// Liveness and readiness probes, kept deliberately separate per
// RubberDucks_FINAL_Assignment3 s3.3.2 (avoiding the cascading-failure
// anti-pattern of one endpoint that does both).

import { Router, Request, Response } from "express";
import { checkDatabaseConnection } from "../config/db";

export const healthRouter = Router();

// Liveness: lightweight, in-memory only. Never queries the database -
// a slow/unavailable DB must not cause the orchestrator to restart a
// healthy process (s3.3.2).
healthRouter.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

// Readiness: verifies the process can actually serve traffic, including
// its database dependency. A failing check here should remove the
// instance from the load balancer, not restart it.
healthRouter.get("/readyz", async (_req: Request, res: Response) => {
  const dbReady = await checkDatabaseConnection();
  if (!dbReady) {
    res.status(503).json({ status: "not_ready", database: "unreachable" });
    return;
  }
  res.status(200).json({ status: "ready", database: "connected" });
});
