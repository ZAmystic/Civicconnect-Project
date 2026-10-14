import { expect, test } from "@playwright/test";

const userResponse = {
    success: true,
    user: {
        full_name: "M3 Test",
        full_surname: "Requester",
        email: "m3-requester@example.test",
        role: "Requester",
        canManageUsers: false
    }
};

function requesterDashboardResponse(status = "Submitted") {
    return {
        success: true,
        dashboard: {
            total_tickets: 1,
            active_tickets: status === "Submitted" ? 1 : 0,
            completed_tickets: 0,
            rejected_tickets: 0,
            recent_tickets: 1,
            last_activity_at: "2026-10-14T10:00:00.000Z",
            tickets: [{
                ticket_id: "7",
                tracking_ref: "TCK-D-2026-1001",
                category_name: "Damaged Equipment",
                description: "A bench is damaged.",
                status,
                created_at: "2026-10-14T09:00:00.000Z",
                updated_at: "2026-10-14T10:00:00.000Z",
                request_type: "damaged-equipment",
                details: {
                    equipmentType: "Park Bench / Table",
                    assetId: "BENCH-22",
                    location: "Civic Park",
                    locationLatitude: 12.5,
                    locationLongitude: -45.25,
                    damageType: ["broken-vandalized"],
                    operationalStatus: "out-of-service",
                    description: "A bench is damaged."
                },
                editable_fields: [
                    {
                        name: "equipmentType",
                        kind: "text",
                        required: true,
                        maxLength: 80,
                        values: ["Park Bench / Table", "Public Gym Unit"]
                    },
                    { name: "assetId", kind: "text", maxLength: 80 },
                    {
                        name: "damageType",
                        kind: "text-list",
                        required: true,
                        values: ["broken-vandalized", "sharp-edge"]
                    },
                    {
                        name: "operationalStatus",
                        kind: "text",
                        required: true,
                        maxLength: 40,
                        values: ["partially-usable", "out-of-service", "immediate-danger"]
                    },
                    { name: "description", kind: "text", required: true, maxLength: 3000 }
                ]
            }]
        }
    };
}

test.beforeEach(async ({ page }) => {
    await page.route("**/api/users/me", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(userResponse) })
    );
});

test("[E2E-01] dashboard groups Create Ticket separately from service-request shortcuts", async ({ page }) => {
    await page.goto("/src/pages/dashboard.html");

    const createTicket = page.locator("#createTicketNav");
    await expect(createTicket).toHaveAttribute("href", "services.html");
    await expect(page.locator(".profile-name")).toHaveText("M3 Test Requester");

    const serviceHeading = page.locator(".nav-section-title", { hasText: "Service Requests" });
    const damagedEquipmentLink = page.locator(".service-page-nav-item", {
        hasText: "Damaged Equipment"
    });
    await expect(serviceHeading).toBeVisible();
    await expect(damagedEquipmentLink).toBeVisible();
    const navigationGroupsAreOrdered = await page.evaluate(() => {
        const createLink = document.querySelector("#createTicketNav");
        const requestsHeading = Array.from(document.querySelectorAll(".nav-section-title"))
            .find((heading) => heading.textContent?.trim() === "Service Requests");
        const serviceLink = document.querySelector(".service-page-nav-item");
        return Boolean(
            createLink &&
            requestsHeading &&
            serviceLink &&
            (createLink.compareDocumentPosition(requestsHeading) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            (requestsHeading.compareDocumentPosition(serviceLink) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
    });
    expect(navigationGroupsAreOrdered).toBe(true);
    await createTicket.click();
    await expect(page).toHaveURL(/\/src\/pages\/services\.html$/);
});

test("[E2E-02] requester can navigate from dashboard and submit a damaged-equipment form", async ({ page }) => {
    await page.route("**/api/requests", async (route) => {
        const request = route.request().postDataJSON();
        expect(request).toMatchObject({
            requestType: "damaged-equipment",
            details: {
                equipmentType: "Park Bench / Table",
                location: "Civic Park",
                damageType: ["broken-vandalized", "sharp-edge"],
                operationalStatus: "out-of-service"
            }
        });
        await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
                success: true,
                ticket: { tracking_ref: "TCK-D-2026-1026" }
            })
        });
    });

    await page.goto("/src/pages/dashboard.html");
    await page.locator("#createTicketNav").click();
    await page.locator('.service-card-btn[href="damaged_equipment.html"]').click();

    await page.locator('input[name="equipmentType"][value="Park Bench / Table"]').check();
    await page.locator("#equipmentLocation").fill("Civic Park");
    await page.locator('input[name="damageType"][value="broken-vandalized"]').check();
    await page.locator('input[name="damageType"][value="sharp-edge"]').check();
    await expect(page.locator('input[name="damageType"]:checked')).toHaveCount(2);
    await page.locator('input[name="operationalStatus"][value="out-of-service"]').check();
    await page.locator("#equipmentDescription").fill("A bench is broken and unavailable.");
    await page.getByRole("button", { name: "Submit equipment report" }).click();

    await expect(page.locator("[data-request-message]")).toContainText("TCK-D-2026-1026");
    await expect(page.locator("#equipmentLocation")).toHaveValue("");
});

test("[E2E-07] maintenance accepts multiple checkbox choices and enforces a single radio choice", async ({ page }) => {
    await page.route("**/api/requests", async (route) => {
        const request = route.request().postDataJSON();
        expect(request).toMatchObject({
            requestType: "maintenance",
            details: {
                maintenanceType: "Pothole / Road Degradation",
                severity: "traffic-blocked",
                utilityInvolvement: ["gushing-water", "exposed-line"],
                estimatedSize: "Moderate 1–5m²"
            }
        });
        await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
                success: true,
                ticket: { tracking_ref: "TCK-M-2026-1001" }
            })
        });
    });

    await page.goto("/src/pages/services.html");
    await page.locator('.service-card-btn[href="maintenance_request.html"]').click();
    await page.locator('input[name="maintenanceType"][value="Pothole / Road Degradation"]').check();
    await page.locator("#maintenanceLocation").fill("Civic Park entrance");
    await page.locator('input[name="severity"][value="isolated"]').check();
    await page.locator('input[name="severity"][value="traffic-blocked"]').check();
    await expect(page.locator('input[name="severity"][value="isolated"]')).not.toBeChecked();
    await page.locator('input[name="utilityInvolvement"][value="gushing-water"]').check();
    await page.locator('input[name="utilityInvolvement"][value="exposed-line"]').check();
    await expect(page.locator('input[name="utilityInvolvement"]:checked')).toHaveCount(2);
    await page.locator('input[name="estimatedSize"][value="Moderate 1–5m²"]').check();
    await page.locator("#maintenanceDescription").fill("Water is running across the roadway.");
    await page.getByRole("button", { name: "Submit maintenance report" }).click();

    await expect(page.locator("[data-request-message]")).toContainText("TCK-M-2026-1001");
});

test("[E2E-03] requester can edit a submitted ticket and receives an audit confirmation", async ({ page }) => {
    await page.route("**/api/requests/mine", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(requesterDashboardResponse())
        })
    );
    await page.route("**/api/requests/7", async (route) => {
        expect(route.request().method()).toBe("PUT");
        const request = route.request().postDataJSON();
        expect(request.details).toMatchObject({
            assetId: "",
            damageType: ["broken-vandalized", "sharp-edge"],
            description: "A bench has a corrected description."
        });
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                success: true,
                message: "Your changes were saved and recorded in the audit log.",
                ticket: {
                    ticket_id: "7",
                    description: "A bench has a corrected description.",
                    updated_at: "2026-10-14T11:00:00.000Z",
                    details: {
                        equipmentType: "Park Bench / Table",
                        assetId: "",
                        location: "Civic Park",
                        locationLatitude: 12.5,
                        locationLongitude: -45.25,
                        damageType: ["broken-vandalized", "sharp-edge"],
                        operationalStatus: "out-of-service",
                        description: "A bench has a corrected description."
                    }
                }
            })
        });
    });

    await page.goto("/src/pages/dashboard.html");
    await page.getByRole("button", {
        name: "View details for Damaged Equipment, reference TCK-D-2026-1001"
    }).click();
    await expect(page.locator("#requestDetailsStatusMessage"))
        .toContainText("You can still edit its details");
    await page.locator("#editRequestDetails").click();
    await expect(page.locator('#requestEditFields [name="location"]')).toHaveCount(0);
    await expect(page.locator('#requestEditFields [name="equipmentType"]')).toHaveAttribute("required", "");
    await expect(page.locator('#requestEditFields [name="assetId"]')).not.toHaveAttribute("required", "");
    await expect(page.locator("#requestEditFields")).toContainText("Asset ID (optional)");
    await page.locator('#requestEditFields [name="assetId"]').fill("");
    await page.locator('#requestEditFields input[name="damageType"][value="sharp-edge"]').check();
    await expect(page.locator('#requestEditFields input[name="damageType"]:checked')).toHaveCount(2);
    await page.locator('#requestEditFields textarea[name="description"]').fill(
        "A bench has a corrected description."
    );
    await page.locator("#saveRequestEdit").click();

    await expect(page.locator("#requestDetailsStatusMessage"))
        .toHaveText("Your changes were saved and recorded in the audit log.");
    await expect(page.locator("#requestDetailsFields"))
        .toContainText("A bench has a corrected description.");
});

test("[E2E-04] requester cannot edit a ticket after it is assigned", async ({ page }) => {
    await page.route("**/api/requests/mine", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(requesterDashboardResponse("Assigned"))
        })
    );

    await page.goto("/src/pages/dashboard.html");
    await page.getByRole("button", {
        name: "View details for Damaged Equipment, reference TCK-D-2026-1001"
    }).click();

    await expect(page.locator("#requestDetailsStatusMessage"))
        .toContainText("Editing is no longer available");
    await expect(page.locator("#editRequestDetails")).toBeHidden();
});

test("[E2E-05] request status boxes use the requested colors", async ({ page }) => {
    const response = requesterDashboardResponse();
    const statuses = ["Resolved", "In_Progress", "Submitted", "Assigned", "Closed", "Rejected"];
    response.dashboard.tickets = statuses.map((status, index) => ({
        ...response.dashboard.tickets[0],
        ticket_id: String(index + 1),
        tracking_ref: `TCK-D-2026-${1001 + index}`,
        status
    }));
    await page.route("**/api/requests/mine", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(response)
        })
    );

    await page.goto("/src/pages/dashboard.html");

    const expectedBackgrounds = [
        "rgba(22, 163, 74, 0.14)",
        "rgba(37, 99, 235, 0.15)",
        "rgba(148, 163, 184, 0.15)",
        "rgba(234, 88, 12, 0.16)",
        "rgba(220, 38, 38, 0.16)",
        "rgba(127, 29, 29, 0.32)"
    ];
    const statusBoxes = page.locator("#requestList .request-status");
    await expect(statusBoxes).toHaveCount(statuses.length);
    for (const [index, expectedBackground] of expectedBackgrounds.entries()) {
        await expect(statusBoxes.nth(index)).toHaveCSS("background-color", expectedBackground);
    }
});

test("[E2E-06] requester can cancel a submitted ticket without including it in outcomes", async ({ page }) => {
    await page.route("**/api/requests/mine", (route) => {
        const response = requesterDashboardResponse();
        Object.assign(response.dashboard, {
            total_tickets: 4,
            active_tickets: 2,
            completed_tickets: 1,
            rejected_tickets: 1,
            cancelled_tickets: 0
        });
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(response)
        });
    });
    await page.route("**/api/requests/7/cancel", async (route) => {
        expect(route.request().method()).toBe("POST");
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                success: true,
                message: "Your request was cancelled and recorded in the audit log.",
                ticket: {
                    ticket_id: "7",
                    status: "Cancelled",
                    updated_at: "2026-10-14T11:00:00.000Z"
                }
            })
        });
    });
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/src/pages/dashboard.html");
    await page.getByRole("button", {
        name: "View details for Damaged Equipment, reference TCK-D-2026-1001"
    }).click();
    await page.locator("#cancelRequestDetails").click();

    await expect(page.locator("#requestDetailsStatus")).toContainText("Cancelled");
    await expect(page.locator("#requestDetailsStatusMessage"))
        .toHaveText("Your request was cancelled and recorded in the audit log.");
    await expect(page.locator("#cancelRequestDetails")).toBeHidden();
    await expect(page.locator("#cancelledSegment")).toHaveCount(0);
    await expect(page.locator(".outcome-legend")).not.toContainText("Cancelled");
    await expect(page.locator("#completionRate")).toHaveText("33%");
    for (const segmentId of ["activeSegment", "completedSegment", "rejectedSegment"]) {
        const width = await page.locator(`#${segmentId}`).evaluate((element) =>
            Number.parseFloat((element as HTMLElement).style.width)
        );
        expect(width).toBeCloseTo(100 / 3, 2);
    }
});
