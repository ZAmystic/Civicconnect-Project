import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
    resetRequestApiHarness,
    startRequestApiServer,
    stopRequestApiServer,
    type RequestApiHarness
} from "../support/request-api-harness";

let harness: RequestApiHarness;

const damagedEquipment = {
    equipmentType: "Park Bench / Table",
    assetId: "BENCH-4",
    location: "Civic Park, north entrance",
    damageType: ["broken-vandalized"],
    operationalStatus: "out-of-service",
    description: "The bench frame is broken."
};

beforeAll(startRequestApiServer);
afterAll(stopRequestApiServer);
beforeEach(() => {
    harness = resetRequestApiHarness();
});

describe("black-box request validation", () => {
    it("[BF-01] rejects an unauthenticated caller before acquiring a database connection", async () => {
        harness = resetRequestApiHarness({ sessionUserId: null });

        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestType: "damaged-equipment", details: damagedEquipment })
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ success: false });
        expect(harness.calls).toHaveLength(0);
    });

    it("[BF-02] rejects unsupported request types, missing required values, and unknown fields", async () => {
        const invalidBodies = [
            { requestType: "unknown", details: damagedEquipment },
            { requestType: "damaged-equipment", details: { ...damagedEquipment, location: "  " } },
            { requestType: "damaged-equipment", details: { ...damagedEquipment, unrecognized: "value" } }
        ];

        for (const body of invalidBodies) {
            const response = await fetch(`${harness.baseUrl}/api/requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            expect(response.status).toBe(400);
            expect((await response.json()).success).toBe(false);
        }
        expect(harness.calls).toHaveLength(0);
    });

    it("[BF-03] accepts an 80-character optional asset identifier and rejects the 81-character boundary", async () => {
        const accepted = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "damaged-equipment",
                details: { ...damagedEquipment, assetId: "A".repeat(80) }
            })
        });

        expect(accepted.status).toBe(201);
        expect(harness.calls.find(({ sql }) => sql.includes('INSERT INTO "DamagedEquipmentDetails"'))?.params[2])
            .toBe("A".repeat(80));

        harness = resetRequestApiHarness();
        const rejected = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "damaged-equipment",
                details: { ...damagedEquipment, assetId: "A".repeat(81) }
            })
        });
        expect(rejected.status).toBe(400);
        expect(harness.calls).toHaveLength(0);
    });

    it("[BF-04] accepts inclusive coordinate limits but rejects out-of-range or incomplete map coordinates", async () => {
        const boundaryResponse = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "damaged-equipment",
                details: {
                    ...damagedEquipment,
                    locationLatitude: -90,
                    locationLongitude: 180
                }
            })
        });
        expect(boundaryResponse.status).toBe(201);

        for (const coordinateValues of [
            { locationLatitude: 90.01, locationLongitude: 0 },
            { locationLatitude: 10, locationLongitude: undefined }
        ]) {
            harness = resetRequestApiHarness();
            const response = await fetch(`${harness.baseUrl}/api/requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requestType: "damaged-equipment",
                    details: { ...damagedEquipment, ...coordinateValues }
                })
            });
            expect(response.status).toBe(400);
            expect(harness.calls).toHaveLength(0);
        }
    });

    it("[BF-05] rejects an invalid lost-property date before opening a transaction", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "lost-property",
                details: {
                    reportingMode: "lost",
                    itemCategory: "Keys",
                    dateTime: "not-a-date",
                    location: "Civic Centre",
                    description: "A set of keys was lost."
                }
            })
        });

        expect(response.status).toBe(400);
        expect((await response.json()).message).toContain("valid date");
        expect(harness.calls).toHaveLength(0);
    });
});
