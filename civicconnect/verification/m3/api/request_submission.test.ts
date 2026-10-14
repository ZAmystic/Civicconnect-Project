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

describe("service request API and persistence integration", () => {
    it("[API-01] commits a damaged-equipment request into its typed table and returns its tracking reference", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "damaged-equipment",
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "BENCH-22",
                    location: "Civic Park",
                    locationLatitude: 12.5,
                    locationLongitude: -45.25,
                    damageType: ["broken-vandalized", "sharp-edge"],
                    operationalStatus: "immediate-danger",
                    description: "Exposed sharp edge on the bench."
                }
            })
        });
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body).toMatchObject({
            success: true,
            ticket: {
                ticket_id: "test-ticket-7",
                tracking_ref: `TCK-D-${new Date().getUTCFullYear()}-1026`
            }
        });
        const detailInsert = harness.calls.find(({ sql }) =>
            sql.includes('INSERT INTO "DamagedEquipmentDetails"')
        );
        expect(detailInsert?.params).toEqual([
            "test-ticket-7",
            "Park Bench / Table",
            "BENCH-22",
            "Civic Park",
            12.5,
            -45.25,
            "broken-vandalized; sharp-edge",
            "immediate-danger",
            "Exposed sharp edge on the bench."
        ]);
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("[API-02] maps a general-request topic and details into ticket and typed-detail records", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "general-request",
                details: {
                    topic: "Water fountain",
                    departmentSuggestion: "Public Works",
                    urgency: "standard",
                    details: "Please inspect the fountain near the library."
                }
            })
        });

        expect(response.status).toBe(201);
        const ticketInsert = harness.calls.find(({ sql }) => sql.includes('INSERT INTO "Ticket"'));
        expect(ticketInsert?.params?.[3]).toBe(
            "Water fountain\n\nPlease inspect the fountain near the library."
        );
        const detailInsert = harness.calls.find(({ sql }) =>
            sql.includes('INSERT INTO "GeneralRequestDetails"')
        );
        expect(detailInsert?.params).toEqual([
            "test-ticket-7",
            "Water fountain",
            "Public Works",
            "standard",
            "Please inspect the fountain near the library."
        ]);
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
    });

    it("[API-03] rolls back the ticket transaction when typed detail persistence fails", async () => {
        harness = resetRequestApiHarness({ failDetailInsert: true });

        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "damaged-equipment",
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "",
                    location: "Civic Park",
                    damageType: "broken-vandalized",
                    operationalStatus: "out-of-service",
                    description: "A broken bench."
                }
            })
        });

        expect(response.status).toBe(500);
        expect((await response.json()).success).toBe(false);
        expect(harness.calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
        expect(harness.calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("[API-04] refuses an inactive account and rolls back before creating a ticket", async () => {
        harness = resetRequestApiHarness({ accountStatus: "inactive" });

        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "general-request",
                details: { topic: "Street sign", urgency: "low" }
            })
        });

        expect(response.status).toBe(401);
        expect(harness.calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
        expect(harness.calls.some(({ sql }) => sql.includes('INSERT INTO "Ticket"'))).toBe(false);
        expect(harness.release).toHaveBeenCalledOnce();
    });
});
