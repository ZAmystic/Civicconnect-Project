interface RequestTicket {
    ticket_id: string;
    tracking_ref: string;
    category_name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    details: Record<string, unknown> | null;
}

interface RequesterDashboard {
    total_tickets: number;
    active_tickets: number;
    completed_tickets: number;
    rejected_tickets: number;
    recent_tickets: number;
    last_activity_at: string | null;
    tickets: RequestTicket[];
}

interface RequesterDashboardResponse {
    success: boolean;
    message?: string;
    dashboard?: RequesterDashboard;
}

const statusLabels: Record<string, string> = {
    Submitted: "Submitted",
    Assigned: "Assigned",
    In_Progress: "In progress",
    Resolved: "Resolved",
    Closed: "Closed",
    Rejected: "Not approved"
};

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Date unavailable";
    }
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function setMetric(id: string, value: number): void {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value.toLocaleString();
    }
}

function renderMetrics(dashboard: RequesterDashboard): void {
    setMetric("totalRequests", dashboard.total_tickets);
    setMetric("activeRequests", dashboard.active_tickets);
    setMetric("completedRequests", dashboard.completed_tickets);
    setMetric("recentRequests", dashboard.recent_tickets);
    setMetric("activeOutcomeCount", dashboard.active_tickets);
    setMetric("completedOutcomeCount", dashboard.completed_tickets);
    setMetric("rejectedOutcomeCount", dashboard.rejected_tickets);

    const completedRate = dashboard.total_tickets === 0
        ? 0
        : Math.round((dashboard.completed_tickets / dashboard.total_tickets) * 100);
    const completionRate = document.getElementById("completionRate");
    if (completionRate) {
        completionRate.textContent = `${completedRate}%`;
    }

    const outcomes = [
        ["activeSegment", dashboard.active_tickets],
        ["completedSegment", dashboard.completed_tickets],
        ["rejectedSegment", dashboard.rejected_tickets]
    ] as const;
    for (const [id, count] of outcomes) {
        const segment = document.getElementById(id) as HTMLElement | null;
        if (segment) {
            const width = dashboard.total_tickets === 0
                ? 0
                : (count / dashboard.total_tickets) * 100;
            segment.style.width = `${width}%`;
        }
    }

    const lastActivity = document.getElementById("lastActivity");
    if (lastActivity) {
        lastActivity.textContent = dashboard.last_activity_at
            ? `Most recent activity: ${formatDate(dashboard.last_activity_at)}`
            : "No request activity yet";
    }
}

function createRequestCard(
    ticket: RequestTicket,
    onSelect: (ticket: RequestTicket) => void
): HTMLElement {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "request-card";
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `View details for ${ticket.category_name}, reference ${ticket.tracking_ref}`);
    card.addEventListener("click", () => onSelect(ticket));

    const main = document.createElement("div");
    main.className = "request-card-main";
    const referenceRow = document.createElement("div");
    referenceRow.className = "request-reference-row";

    const reference = document.createElement("span");
    reference.className = "request-reference";
    reference.textContent = ticket.tracking_ref;
    const submitted = document.createElement("time");
    submitted.dateTime = ticket.created_at;
    submitted.textContent = `Submitted ${formatDate(ticket.created_at)}`;
    referenceRow.append(reference, submitted);

    const title = document.createElement("h3");
    title.textContent = ticket.category_name;
    const description = document.createElement("p");
    description.className = "request-description";
    description.textContent = ticket.description || "No description provided.";
    main.append(referenceRow, title, description);

    const status = document.createElement("span");
    const statusClass = ticket.status.toLowerCase().replaceAll("_", "-");
    status.className = `request-status request-status-${statusClass}`;
    status.textContent = statusLabels[ticket.status] ?? ticket.status;
    card.append(main, status);
    return card;
}

function renderRequests(tickets: RequestTicket[], query: string): void {
    const list = document.getElementById("requestList");
    if (!list) {
        return;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const recentLimit = document.getElementById("recentLimit");
    if (recentLimit) {
        recentLimit.textContent = normalizedQuery ? "Search results" : "Latest 8";
    }
    const filteredTickets = tickets.filter((ticket) =>
        [ticket.tracking_ref, ticket.category_name, ticket.description, ticket.status]
            .some((value) => value.toLowerCase().includes(normalizedQuery)) ||
        Object.values(ticket.details ?? {}).some((value) =>
            String(value ?? "").toLowerCase().includes(normalizedQuery)
        )
    );
    const displayedTickets = normalizedQuery
        ? filteredTickets
        : filteredTickets.slice(0, 8);
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");

    if (displayedTickets.length === 0) {
        const message = document.createElement("p");
        message.className = "request-list-message";
        message.textContent = tickets.length === 0
            ? "You have not submitted any service requests yet."
            : normalizedQuery
                ? "No requests match your search."
                : "You do not have any recent requests.";
        list.append(message);
        return;
    }

    for (const ticket of displayedTickets) {
        list.append(createRequestCard(ticket, openRequestDetails));
    }
}

function renderHistory(tickets: RequestTicket[]): void {
    const list = document.getElementById("requestHistoryList");
    if (!list) {
        return;
    }

    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    if (tickets.length === 0) {
        const message = document.createElement("p");
        message.className = "request-list-message";
        message.textContent = "You have not submitted any service requests yet.";
        list.append(message);
        return;
    }

    for (const ticket of tickets) {
        list.append(createRequestCard(ticket, openRequestDetails));
    }
}

function appendDetail(
    container: HTMLElement,
    label: string,
    value: string
): void {
    const field = document.createElement("div");
    field.className = label === "Description" || label === "Additional details"
        ? "request-detail-field request-detail-field-wide"
        : "request-detail-field";
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    field.append(term, description);
    container.append(field);
}

function formatDetailValue(value: unknown): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(", ");
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

function formatDetailLabel(key: string): string {
    const specialLabels: Record<string, string> = {
        additional_details: "Additional details",
        asset_id: "Asset ID",
        department_suggestion: "Suggested department",
        error_message: "Error message",
        facility_address: "Facility address",
        fault_classification: "Fault type",
        immediate_threat: "Immediate threat",
        item_category: "Item category",
        occurred_at: "Date and time",
        operational_status: "Operational status",
        reporting_mode: "Report type",
        system_affected: "System affected",
        utility_involvement: "Utility involvement"
    };
    if (specialLabels[key]) {
        return specialLabels[key];
    }
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
    return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function openRequestDetails(ticket: RequestTicket): void {
    const dialog = document.getElementById("requestDetailsDialog") as HTMLDialogElement | null;
    const title = document.getElementById("requestDetailsTitle");
    const reference = document.getElementById("requestDetailsReference");
    const status = document.getElementById("requestDetailsStatus");
    const submitted = document.getElementById("requestDetailsSubmitted");
    const updated = document.getElementById("requestDetailsUpdated");
    const fields = document.getElementById("requestDetailsFields");
    if (!dialog || !title || !reference || !status || !submitted || !updated || !fields) {
        return;
    }

    title.textContent = ticket.category_name;
    reference.textContent = ticket.tracking_ref;
    status.textContent = statusLabels[ticket.status] ?? ticket.status;
    status.className = `request-status request-status-${ticket.status.toLowerCase().replaceAll("_", "-")}`;
    submitted.textContent = formatDateTime(ticket.created_at);
    updated.textContent = formatDateTime(ticket.updated_at);
    fields.replaceChildren();

    const detailEntries = Object.entries(ticket.details ?? {});
    const latitude = ticket.details?.latitude;
    const longitude = ticket.details?.longitude;
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
        appendDetail(fields, "Map coordinates", `${String(latitude)}, ${String(longitude)}`);
    }

    for (const [key, rawValue] of detailEntries) {
        if (key === "latitude" || key === "longitude") {
            continue;
        }
        const value = formatDetailValue(rawValue);
        if (value !== null) {
            appendDetail(fields, formatDetailLabel(key), value);
        }
    }
    if (fields.childElementCount === 0) {
        appendDetail(fields, "Description", ticket.description || "No additional details were provided.");
    }

    if (!dialog.open) {
        dialog.showModal();
    }
}

export async function initializeRequesterDashboard(): Promise<void> {
    const list = document.getElementById("requestList");
    const historyList = document.getElementById("requestHistoryList");
    const search = document.getElementById("dashboardSearch") as HTMLInputElement | null;
    const historyDialog = document.getElementById("requestHistoryDialog") as HTMLDialogElement | null;
    const detailsDialog = document.getElementById("requestDetailsDialog") as HTMLDialogElement | null;
    const closeHistory = document.getElementById("closeRequestHistory");
    const closeDetails = document.getElementById("closeRequestDetails");
    const openHistory = document.getElementById("openRequestHistory");
    let tickets: RequestTicket[] = [];

    search?.addEventListener("input", () => {
        renderRequests(tickets, search.value);
    });
    openHistory?.addEventListener("click", () => {
        if (historyDialog && !historyDialog.open) {
            historyDialog.showModal();
        }
    });
    closeHistory?.addEventListener("click", () => historyDialog?.close());
    closeDetails?.addEventListener("click", () => detailsDialog?.close());
    historyDialog?.addEventListener("click", (event) => {
        if (event.target === historyDialog) {
            historyDialog.close();
        }
    });
    detailsDialog?.addEventListener("click", (event) => {
        if (event.target === detailsDialog) {
            detailsDialog.close();
        }
    });

    try {
        const response = await fetch("/api/requests/mine", {
            headers: { Accept: "application/json" }
        });
        const body = await response.json() as RequesterDashboardResponse;
        if (!response.ok || !body.success || !body.dashboard) {
            throw new Error(body.message ?? "Your requests could not be loaded.");
        }

        tickets = body.dashboard.tickets;
        renderMetrics(body.dashboard);
        renderRequests(tickets, search?.value ?? "");
        renderHistory(tickets);
    } catch (error) {
        const message = document.createElement("p");
        message.className = "request-list-message";
        const errorText = error instanceof Error
            ? error.message
            : "Your requests could not be loaded. Please try again.";
        message.append(document.createTextNode(errorText));
        if (errorText.startsWith("Sign in") || errorText.startsWith("Your account is unavailable")) {
            const loginLink = document.createElement("a");
            loginLink.className = "dashboard-login-link";
            loginLink.href = "login.html";
            loginLink.textContent = "Sign in";
            message.append(document.createTextNode(" "), loginLink);
        }
        if (list) {
            list.setAttribute("aria-busy", "false");
            list.replaceChildren(message.cloneNode(true));
        }
        if (historyList) {
            historyList.setAttribute("aria-busy", "false");
            historyList.replaceChildren(message);
        }
    }
}