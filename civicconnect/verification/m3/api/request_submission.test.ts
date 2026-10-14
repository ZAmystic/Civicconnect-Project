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
    it("returns requester dashboard metrics only for the signed-in user's tickets", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests/mine`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            dashboard: {
                total_tickets: 3,
                active_tickets: 1,
                completed_tickets: 1,
                rejected_tickets: 1,
                recent_tickets: 2,
                tickets: []
            }
        });
        const ticketQuery = harness.calls.find(({ sql }) =>
            sql.includes("WITH scoped_tickets AS")
        );
        expect(ticketQuery?.sql).toContain("ticket.citizen_id = $1");
        expect(ticketQuery?.params).toEqual([42]);
        expect(ticketQuery?.sql).not.toMatch(/\bLIMIT\s+8\b/i);
        for (const detailTable of [
            "DamagedEquipmentDetails",
            "SecurityConcernDetails",
            "ITSupportDetails",
            "MaintenanceDetails",
            "LostPropertyDetails",
            "GeneralRequestDetails",
            "FacilityFaultDetails"
        ]) {
            expect(ticketQuery?.sql).toContain(`LEFT JOIN "${detailTable}"`);
        }
    });

    it("does not return requester data without an authenticated session", async () => {
        harness = resetRequestApiHarness({ sessionUserId: null });

        const response = await fetch(`${harness.baseUrl}/api/requests/mine`);

        expect(response.status).toBe(401);
        expect(harness.calls).toHaveLength(0);
    });

    it("allows a requester to correct a submitted ticket and records a complete audit trail", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests/7`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "",
                    damageType: ["broken-vandalized", "sharp-edge"],
                    operationalStatus: "out-of-service",
                    description: "A damaged bench with a corrected description."
                }
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            message: "Your changes were saved and recorded in the audit log.",
            ticket: {
                ticket_id: "7",
                description: "A damaged bench with a corrected description."
            }
        });
        expect(harness.calls.some(({ sql }) =>
            sql.includes('UPDATE "DamagedEquipmentDetails"')
        )).toBe(true);
        const detailsUpdate = harness.calls.find(({ sql }) =>
            sql.includes('UPDATE "DamagedEquipmentDetails"')
        );
        expect(detailsUpdate?.params?.[2]).toBe("");
        expect(detailsUpdate?.params?.[6]).toBe("broken-vandalized; sharp-edge");
        const editAudit = harness.calls.find(({ sql }) =>
            sql.includes('INSERT INTO "TicketEditAudit"')
        );
        expect(editAudit?.params?.[2]).toContain('"description":"A damaged bench."');
        expect(editAudit?.params?.[3]).toContain('"description":"A damaged bench with a corrected description."');
        expect(editAudit?.params?.[4]).toContain('"description"');
        expect(editAudit?.params?.[4]).toContain('"assetId"');
        expect(editAudit?.params?.[4]).toContain('"damageType"');
        const visibleAudit = harness.calls.find(({ sql }) =>
            sql.includes('INSERT INTO "AuditLog"')
        );
        expect(visibleAudit?.params?.[2]).toContain("Requester edited submitted request details");
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("rejects a request edit that attempts to change its location", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests/7`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                details: {
                    location: "An altered address",
                    description: "A damaged bench."
                }
            })
        });

        expect(response.status).toBe(400);
        expect(harness.calls.some(({ sql }) =>
            sql.includes('UPDATE "DamagedEquipmentDetails"')
        )).toBe(false);
        expect(harness.calls.at(-1)?.sql).toBe("ROLLBACK");
    });

    it("refuses edits once a ticket has moved beyond Submitted", async () => {
        harness = resetRequestApiHarness({ editTicketStatus: "Assigned" });

        const response = await fetch(`${harness.baseUrl}/api/requests/7`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ details: { location: "Updated" } })
        });
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.message).toContain("moved beyond the Submitted stage");
        expect(harness.calls.some(({ sql }) =>
            sql.includes('UPDATE "DamagedEquipmentDetails"')
        )).toBe(false);
        expect(harness.calls.at(-1)?.sql).toBe("ROLLBACK");
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("rolls back a request correction if the detailed audit record cannot be written", async () => {
        harness = resetRequestApiHarness({ failEditAuditInsert: true });

        const response = await fetch(`${harness.baseUrl}/api/requests/7`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "BENCH-22",
                    damageType: ["broken-vandalized"],
                    operationalStatus: "out-of-service",
                    description: "A corrected bench report."
                }
            })
        });

        expect(response.status).toBe(500);
        expect(harness.calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
        expect(harness.calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("still writes a visible audit log entry if the optional edit snapshot migration is missing", async () => {
        harness = resetRequestApiHarness({ missingTicketEditAuditTable: true });

        const response = await fetch(`${harness.baseUrl}/api/requests/7`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "BENCH-22",
                    damageType: ["broken-vandalized"],
                    operationalStatus: "out-of-service",
                    description: "A corrected bench report."
                }
            })
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(harness.calls.some(({ sql }) => sql === "ROLLBACK TO SAVEPOINT detailed_edit_audit"))
            .toBe(true);
        expect(harness.calls.some(({ sql }) => sql.includes('INSERT INTO "AuditLog"')))
            .toBe(true);
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
    });

    it("cancels a submitted request without deleting it and logs the status change", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests/7/cancel`, {
            method: "POST"
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            ticket: { ticket_id: "7", status: "Cancelled" }
        });
        const statusUpdate = harness.calls.find(({ sql }) =>
            sql.includes('UPDATE "Ticket"') && sql.includes("status = 'Cancelled'")
        );
        expect(statusUpdate?.sql).toContain("status = 'Submitted'");
        const audit = harness.calls.find(({ sql }) => sql.includes('INSERT INTO "AuditLog"'));
        expect(audit?.params?.slice(0, 2)).toEqual(["7", 42]);
        expect(audit?.sql).toContain("'Submitted', 'Cancelled'");
        expect(audit?.sql).toContain("Requester cancelled the request");
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
        expect(harness.release).toHaveBeenCalledOnce();
    });

    it("does not allow cancellation after a ticket leaves Submitted", async () => {
        harness = resetRequestApiHarness({ editTicketStatus: "In_Progress" });

        const response = await fetch(`${harness.baseUrl}/api/requests/7/cancel`, {
            method: "POST"
        });

        expect(response.status).toBe(409);
        expect(harness.calls.some(({ sql }) => sql.includes('INSERT INTO "AuditLog"'))).toBe(false);
        expect(harness.calls.at(-1)?.sql).toBe("ROLLBACK");
    });

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

    it("stores multiple maintenance utility selections", async () => {
        const response = await fetch(`${harness.baseUrl}/api/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "maintenance",
                details: {
                    maintenanceType: "Pothole / Road Degradation",
                    location: "Civic Park entrance",
                    severity: "traffic-blocked",
                    utilityInvolvement: ["gushing-water", "exposed-line"],
                    estimatedSize: "Moderate 1–5m²",
                    description: "Water is running across the roadway."
                }
            })
        });

        expect(response.status).toBe(201);
        const detailInsert = harness.calls.find(({ sql }) =>
            sql.includes('INSERT INTO "MaintenanceDetails"')
        );
        expect(detailInsert?.params).toEqual([
            "test-ticket-7",
            "Pothole / Road Degradation",
            "Civic Park entrance",
            null,
            null,
            "traffic-blocked",
            "gushing-water; exposed-line",
            "Moderate 1–5m²",
            "Water is running across the roadway."
        ]);
        expect(harness.calls.at(-1)?.sql).toBe("COMMIT");
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
