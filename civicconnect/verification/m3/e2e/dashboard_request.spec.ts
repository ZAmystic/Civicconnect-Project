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
                damageType: "broken-vandalized",
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

    await page.locator("#equipmentType").selectOption("Park Bench / Table");
    await page.locator("#equipmentLocation").fill("Civic Park");
    await page.locator('input[name="damageType"][value="broken-vandalized"]').check();
    await page.locator('input[name="operationalStatus"][value="out-of-service"]').check();
    await page.locator("#equipmentDescription").fill("A bench is broken and unavailable.");
    await page.getByRole("button", { name: "Submit equipment report" }).click();

    await expect(page.locator("[data-request-message]")).toContainText("TCK-D-2026-1026");
    await expect(page.locator("#equipmentLocation")).toHaveValue("");
});
