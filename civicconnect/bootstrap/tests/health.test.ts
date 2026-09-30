// tests/health.test.ts
// Smoke test for the bootstrap app shell - confirms the liveness probe
// responds without needing a real database connection, consistent with
// s3.3.2 (liveness must not depend on downstream dependencies).

import request from "supertest";
import { createApp } from "../src/app";

describe("GET /healthz", () => {
  it("returns 200 and status alive without touching the database", async () => {
    const app = createApp();
    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("alive");
  });
});
