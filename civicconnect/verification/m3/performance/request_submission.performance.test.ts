import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    resetRequestApiHarness,
    startRequestApiServer,
    stopRequestApiServer,
    type RequestApiHarness
} from "../support/request-api-harness";

let harness: RequestApiHarness;

beforeAll(startRequestApiServer);
afterAll(stopRequestApiServer);
beforeEach(() => {
    harness = resetRequestApiHarness();
});

describe("manageable request-submission performance scenario", () => {
    it("[PERF-01] completes 30 concurrent validated submissions and reports latency percentiles", async () => {
        const payload = {
            requestType: "damaged-equipment",
            details: {
                equipmentType: "Park Bench / Table",
                assetId: "PERF-BENCH",
                location: "Civic Park",
                damageType: ["broken-vandalized"],
                operationalStatus: "out-of-service",
                description: "Controlled request for route-load measurement."
            }
        };
        const startedAt = performance.now();
        const measurements = await Promise.all(
            Array.from({ length: 30 }, async () => {
                const requestStartedAt = performance.now();
                const response = await fetch(`${harness.baseUrl}/api/requests`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                return { response, durationMs: performance.now() - requestStartedAt };
            })
        );
        const elapsedMs = performance.now() - startedAt;
        const durations = measurements.map(({ durationMs }) => durationMs);

        expect(measurements.every(({ response }) => response.status === 201)).toBe(true);
        expect(harness.calls.filter(({ sql }) => sql === "COMMIT")).toHaveLength(30);
        const sorted = [...durations].sort((left, right) => left - right);
        const percentile = (fraction: number): number =>
            sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? elapsedMs;
        const meanLatency = durations.reduce((total, duration) => total + duration, 0) / durations.length;
        console.info(
            `[PERF-01] 30 concurrent submissions; total=${elapsedMs.toFixed(1)}ms; ` +
            `mean=${meanLatency.toFixed(1)}ms; p50=${percentile(0.5).toFixed(1)}ms; ` +
            `p95=${percentile(0.95).toFixed(1)}ms.`
        );
    });
});
