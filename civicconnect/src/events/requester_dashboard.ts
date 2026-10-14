interface RequestTicket {
    ticket_id: string;
    tracking_ref: string;
    category_name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    details: Record<string, unknown> | null;
    request_type: string | null;
    editable_fields: EditableField[];
}

interface EditableField {
    name: string;
    kind: "text" | "boolean" | "coordinate" | "text-list";
    required?: boolean;
    maxLength?: number;
    values?: string[];
    minimum?: number;
    maximum?: number;
}

interface RequesterDashboard {
    total_tickets: number;
    active_tickets: number;
    completed_tickets: number;
    rejected_tickets: number;
    cancelled_tickets: number;
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
    Submitted: "Submitted · awaiting review",
    Assigned: "Assigned · a team member is responsible",
    In_Progress: "In progress · work is underway",
    Resolved: "Resolved · marked as fixed",
    Closed: "Closed · request complete",
    Rejected: "Not approved · request rejected",
    Cancelled: "Cancelled · withdrawn by you"
};

const statusDescriptions: Record<string, string> = {
    Submitted: "Your request has been received. You can still edit its details while it is awaiting review.",
    Assigned: "Your request has been assigned to a team member. Editing is no longer available.",
    In_Progress: "Work on your request is underway. Editing is no longer available.",
    Resolved: "The issue has been marked as fixed. Editing is no longer available.",
    Closed: "The request has been completed and closed. Editing is no longer available.",
    Rejected: "The request was not approved. Editing is no longer available.",
    Cancelled: "You cancelled this request. It remains in your history for reference."
};

let cachedTickets: RequestTicket[] = [];
let selectedTicket: RequestTicket | null = null;
let cachedDashboard: RequesterDashboard | null = null;

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

    const outcomeTotal = Math.max(
        0,
        dashboard.total_tickets - (dashboard.cancelled_tickets ?? 0)
    );
    const completedRate = outcomeTotal === 0
        ? 0
        : Math.round((dashboard.completed_tickets / outcomeTotal) * 100);
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
            const width = outcomeTotal === 0
                ? 0
                : (count / outcomeTotal) * 100;
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
    const card = document.createElement("article");
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.className = "request-card";
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `View details for ${ticket.category_name}, reference ${ticket.tracking_ref}`);
    card.addEventListener("click", () => onSelect(ticket));
    card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(ticket);
        }
    });

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
        [
            ticket.tracking_ref,
            ticket.category_name,
            ticket.description,
            ticket.status,
            statusLabels[ticket.status] ?? ticket.status
        ]
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
        additionalDetails: "Additional details",
        asset_id: "Asset ID",
        assetId: "Asset ID",
        department_suggestion: "Suggested department",
        departmentSuggestion: "Suggested department",
        error_message: "Error message",
        errorCode: "Error message",
        facility_address: "Facility address",
        facilityAddress: "Facility address",
        fault_classification: "Fault type",
        faultClassification: "Fault type",
        immediate_threat: "Immediate threat",
        immediateThreat: "Immediate threat",
        item_category: "Item category",
        itemCategory: "Item category",
        occurred_at: "Date and time",
        dateTime: "Date and time",
        operational_status: "Operational status",
        operationalStatus: "Operational status",
        reporting_mode: "Report type",
        reportingMode: "Report type",
        systemAffected: "System affected",
        system_affected: "System affected",
        utility_involvement: "Utility involvement",
        utilityInvolvement: "Utility involvement"
    };
    if (specialLabels[key]) {
        return specialLabels[key];
    }
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
    return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatOptionLabel(value: string): string {
    return value.replaceAll("-", " ").replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function createEditControl(field: EditableField, value: unknown): HTMLElement {
    const labelText = formatDetailLabel(field.name);
    if (field.kind === "text-list") {
        const group = document.createElement("fieldset");
        group.className = "request-edit-field request-edit-checkbox-group";
        const legend = document.createElement("legend");
        legend.textContent = labelText;
        group.append(legend);
        const selectedValues = Array.isArray(value)
            ? value.map(String)
            : typeof value === "string" && value
                ? value.split("; ")
                : [];
        for (const optionValue of field.values ?? []) {
            const optionLabel = document.createElement("label");
            optionLabel.className = "request-edit-checkbox";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = field.name;
            checkbox.value = optionValue;
            checkbox.checked = selectedValues.includes(optionValue);
            optionLabel.append(checkbox, document.createTextNode(formatOptionLabel(optionValue)));
            group.append(optionLabel);
        }
        return group;
    }

    const label = document.createElement("label");
    label.className = "request-edit-field";
    const caption = document.createElement("span");
    caption.textContent = labelText;
    label.append(caption);

    if (field.kind === "boolean") {
        const checkboxLabel = document.createElement("span");
        checkboxLabel.className = "request-edit-boolean";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = field.name;
        checkbox.checked = value === true || value === "true";
        checkboxLabel.append(checkbox, document.createTextNode("Yes"));
        label.append(checkboxLabel);
        return label;
    }

    if (field.values) {
        const select = document.createElement("select");
        select.name = field.name;
        select.required = Boolean(field.required);
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = field.required ? "Choose an option" : "Not specified";
        select.append(placeholder);
        for (const optionValue of field.values) {
            const option = document.createElement("option");
            option.value = optionValue;
            option.textContent = formatOptionLabel(optionValue);
            select.append(option);
        }
        select.value = typeof value === "string" ? value : "";
        label.append(select);
        return label;
    }

    if (field.name === "description" || field.name === "details" || field.name === "incidentDescription") {
        const textarea = document.createElement("textarea");
        textarea.name = field.name;
        textarea.maxLength = field.maxLength ?? 3000;
        textarea.required = Boolean(field.required);
        textarea.rows = 4;
        textarea.value = typeof value === "string" ? value : "";
        label.append(textarea);
        return label;
    }

    const input = document.createElement("input");
    input.name = field.name;
    input.required = Boolean(field.required);
    input.maxLength = field.maxLength ?? 300;
    if (field.kind === "coordinate") {
        input.type = "number";
        input.step = "any";
        if (field.minimum !== undefined) {
            input.min = String(field.minimum);
        }
        if (field.maximum !== undefined) {
            input.max = String(field.maximum);
        }
        input.value = typeof value === "number" ? String(value) : "";
    } else if (field.name === "dateTime") {
        input.type = "datetime-local";
        input.step = "1";
        input.value = typeof value === "string" ? value.slice(0, 19) : "";
    } else {
        input.type = "text";
        input.value = typeof value === "string" ? value : "";
    }
    label.append(input);
    return label;
}

function renderEditFields(ticket: RequestTicket, container: HTMLElement): void {
    container.replaceChildren();
    for (const field of ticket.editable_fields) {
        container.append(createEditControl(field, ticket.details?.[field.name]));
    }
}

function serializeEditForm(
    form: HTMLFormElement,
    ticket: RequestTicket
): Record<string, string | number | boolean | string[] | null> {
    const details: Record<string, string | number | boolean | string[] | null> = {};
    for (const field of ticket.editable_fields) {
        if (field.kind === "text-list") {
            const selected = Array.from(
                form.querySelectorAll<HTMLInputElement>(`input[name="${field.name}"]:checked`)
            ).map((input) => input.value);
            details[field.name] = selected;
            continue;
        }

        const control = form.elements.namedItem(field.name);
        if (
            !control ||
            !(control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement)
        ) {
            throw new Error(`The edit form is missing the "${field.name}" field.`);
        }
        if (field.kind === "boolean" && control instanceof HTMLInputElement) {
            details[field.name] = control.checked;
        } else if (field.kind === "coordinate") {
            details[field.name] = control.value === "" ? null : Number(control.value);
        } else {
            details[field.name] = control.value;
        }
    }
    return details;
}

function openRequestDetails(ticket: RequestTicket): void {
    selectedTicket = ticket;
    const dialog = document.getElementById("requestDetailsDialog") as HTMLDialogElement | null;
    const title = document.getElementById("requestDetailsTitle");
    const reference = document.getElementById("requestDetailsReference");
    const status = document.getElementById("requestDetailsStatus");
    const statusMessage = document.getElementById("requestDetailsStatusMessage");
    const submitted = document.getElementById("requestDetailsSubmitted");
    const updated = document.getElementById("requestDetailsUpdated");
    const fields = document.getElementById("requestDetailsFields");
    const editButton = document.getElementById("editRequestDetails") as HTMLButtonElement | null;
    const cancelButton = document.getElementById("cancelRequestDetails") as HTMLButtonElement | null;
    if (
        !dialog || !title || !reference || !status || !statusMessage ||
        !submitted || !updated || !fields || !editButton || !cancelButton
    ) {
        return;
    }

    title.textContent = ticket.category_name;
    reference.textContent = ticket.tracking_ref;
    status.textContent = statusLabels[ticket.status] ?? ticket.status;
    status.className = `request-status request-status-${ticket.status.toLowerCase().replaceAll("_", "-")}`;
    const canEdit = ticket.status === "Submitted" &&
        Boolean(ticket.request_type) &&
        ticket.editable_fields.length > 0 &&
        Boolean(ticket.details);
    editButton.hidden = !canEdit;
    cancelButton.hidden = ticket.status !== "Submitted";
    statusMessage.textContent = ticket.status === "Submitted" && !canEdit
        ? "Your request has been received and is awaiting review."
        : statusDescriptions[ticket.status] ?? "The request status is currently unavailable.";
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
    const editDialog = document.getElementById("requestEditDialog") as HTMLDialogElement | null;
    const editForm = document.getElementById("requestEditForm") as HTMLFormElement | null;
    const editFields = document.getElementById("requestEditFields");
    const editMessage = document.getElementById("requestEditMessage");
    const editSaveButton = document.getElementById("saveRequestEdit") as HTMLButtonElement | null;
    const editButton = document.getElementById("editRequestDetails");
    const cancelButton = document.getElementById("cancelRequestDetails") as HTMLButtonElement | null;
    const closeEditButton = document.getElementById("closeRequestEdit");
    const cancelEditButton = document.getElementById("cancelRequestEdit");
    const closeHistory = document.getElementById("closeRequestHistory");
    const closeDetails = document.getElementById("closeRequestDetails");
    const openHistory = document.getElementById("openRequestHistory");
    let editingTicket: RequestTicket | null = null;
    let isSavingEdit = false;

    search?.addEventListener("input", () => {
        renderRequests(cachedTickets, search.value);
    });
    openHistory?.addEventListener("click", () => {
        if (historyDialog && !historyDialog.open) {
            historyDialog.showModal();
        }
    });
    closeHistory?.addEventListener("click", () => historyDialog?.close());
    closeDetails?.addEventListener("click", () => detailsDialog?.close());
    closeEditButton?.addEventListener("click", () => editDialog?.close());
    cancelEditButton?.addEventListener("click", () => editDialog?.close());
    editButton?.addEventListener("click", () => {
        editingTicket = selectedTicket;
        if (
            !editingTicket ||
            editingTicket.status !== "Submitted" ||
            !editDialog ||
            !editFields ||
            !editMessage
        ) {
            return;
        }
        renderEditFields(editingTicket, editFields);
        editMessage.textContent = "";
        editMessage.classList.remove("is-error");
        if (!editDialog.open) {
            editDialog.showModal();
        }
    });
    cancelButton?.addEventListener("click", async () => {
        const ticketToCancel = selectedTicket;
        if (
            !ticketToCancel ||
            ticketToCancel.status !== "Submitted" ||
            !cancelButton
        ) {
            return;
        }
        if (!window.confirm("Cancel this request? It will remain in your history, but you will not be able to edit it.")) {
            return;
        }

        cancelButton.disabled = true;
        try {
            const response = await fetch(
                `/api/requests/${encodeURIComponent(ticketToCancel.ticket_id)}/cancel`,
                {
                    method: "POST",
                    headers: { Accept: "application/json" }
                }
            );
            const result = await response.json() as {
                success?: boolean;
                message?: string;
                ticket?: { status: string; updated_at: string };
            };
            if (!response.ok || !result.success || !result.ticket) {
                throw new Error(result.message ?? "Your request could not be cancelled. Please try again.");
            }

            ticketToCancel.status = result.ticket.status;
            ticketToCancel.updated_at = result.ticket.updated_at;
            cachedTickets = cachedTickets.map((ticket) =>
                ticket.ticket_id === ticketToCancel.ticket_id ? ticketToCancel : ticket
            );
            if (cachedDashboard) {
                cachedDashboard.active_tickets = Math.max(0, cachedDashboard.active_tickets - 1);
                cachedDashboard.cancelled_tickets += 1;
                cachedDashboard.last_activity_at = result.ticket.updated_at;
                renderMetrics(cachedDashboard);
            }
            renderRequests(cachedTickets, search?.value ?? "");
            renderHistory(cachedTickets);
            openRequestDetails(ticketToCancel);
            const statusMessage = document.getElementById("requestDetailsStatusMessage");
            if (statusMessage) {
                statusMessage.textContent = result.message ?? "Your request was cancelled and recorded in the audit log.";
            }
        } catch (error) {
            const statusMessage = document.getElementById("requestDetailsStatusMessage");
            if (statusMessage) {
                statusMessage.textContent = error instanceof Error
                    ? error.message
                    : "Your request could not be cancelled. Please try again.";
            }
        } finally {
            cancelButton.disabled = false;
        }
    });
    editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (
            isSavingEdit ||
            !editingTicket ||
            editingTicket.status !== "Submitted" ||
            !editForm ||
            !editMessage ||
            !editSaveButton
        ) {
            return;
        }

        const ticketBeingEdited = editingTicket;
        isSavingEdit = true;
        editSaveButton.disabled = true;
        editMessage.classList.remove("is-error");
        editMessage.textContent = "Saving your changes…";
        try {
            const details = serializeEditForm(editForm, ticketBeingEdited);
            for (const field of ticketBeingEdited.editable_fields) {
                const selectedValues = details[field.name];
                if (
                    field.kind === "text-list" &&
                    field.required &&
                    (!Array.isArray(selectedValues) || selectedValues.length === 0)
                ) {
                    throw new Error(`Choose at least one ${formatDetailLabel(field.name).toLowerCase()}.`);
                }
            }

            const response = await fetch(
                `/api/requests/${encodeURIComponent(ticketBeingEdited.ticket_id)}`,
                {
                    method: "PUT",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ details })
                }
            );
            const result = await response.json() as {
                success?: boolean;
                message?: string;
                ticket?: {
                    ticket_id: string;
                    description: string;
                    updated_at: string;
                    details: Record<string, unknown>;
                };
            };
            if (!response.ok || !result.success || !result.ticket) {
                throw new Error(result.message ?? "Your changes could not be saved. Please try again.");
            }

            ticketBeingEdited.description = result.ticket.description;
            ticketBeingEdited.updated_at = result.ticket.updated_at;
            ticketBeingEdited.details = result.ticket.details;
            cachedTickets = cachedTickets.map((ticket) =>
                ticket.ticket_id === ticketBeingEdited.ticket_id ? ticketBeingEdited : ticket
            );
            renderRequests(cachedTickets, search?.value ?? "");
            renderHistory(cachedTickets);
            editDialog?.close();
            openRequestDetails(ticketBeingEdited);
            const statusMessage = document.getElementById("requestDetailsStatusMessage");
            if (statusMessage) {
                statusMessage.textContent = "Your changes were saved and recorded in the audit log.";
            }
        } catch (error) {
            editMessage.textContent = error instanceof Error
                ? error.message
                : "Your changes could not be saved. Please try again.";
            editMessage.classList.add("is-error");
        } finally {
            isSavingEdit = false;
            editSaveButton.disabled = false;
        }
    });
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
    editDialog?.addEventListener("click", (event) => {
        if (event.target === editDialog) {
            editDialog.close();
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

        cachedDashboard = body.dashboard;
        cachedDashboard.cancelled_tickets ??= 0;
        cachedTickets = cachedDashboard.tickets;
        renderMetrics(cachedDashboard);
        renderRequests(cachedTickets, search?.value ?? "");
        renderHistory(cachedTickets);
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