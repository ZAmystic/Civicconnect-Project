interface ContractorTicket {
    ticket_id: string;
    tracking_ref: string;
    requester_name: string;
    category_name: string;
    description: string;
    status: string;
    created_at: string;
    contractor_name: string | null;
}

interface ContractorTicketListResponse {
    success: boolean;
    message?: string;
    viewMode?: "admin" | "contractor";
    tickets?: ContractorTicket[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface ContractorStatusUpdateResponse {
    success: boolean;
    message?: string;
    notification?: {
        sent: boolean;
        message: string;
    };
    ticket?: {
        ticket_id: string;
        status: string;
    };
}

export async function initializeContractorDashboard(): Promise<void> {
    const panel = document.getElementById("ticketAdminPanel");
    const tableBody = document.getElementById("ticketTableBody");
    const message = document.getElementById("ticketAdminMessage");
    const dashboardTitle = document.getElementById("ticketAdminTitle");
    const dashboardDescription = document.getElementById("ticketDashboardDescription");
    const searchInput = document.getElementById("ticketSearchInput") as HTMLInputElement | null;
    const headerSearchInput = document.getElementById("headerTicketSearchInput") as HTMLInputElement | null;
    const statusFilter = document.getElementById("ticketStatusFilter") as HTMLSelectElement | null;
    const paginationSummary = document.getElementById("ticketPaginationSummary");
    const previousButton = document.getElementById("ticketPreviousPage") as HTMLButtonElement | null;
    const nextButton = document.getElementById("ticketNextPage") as HTMLButtonElement | null;
    const refreshButton = document.getElementById("ticketRefreshButton") as HTMLButtonElement | null;
    const ticketDialog = document.getElementById("ticketDetailsDialog") as HTMLDialogElement | null;
    const ticketForm = document.getElementById("ticketStatusForm") as HTMLFormElement | null;
    const dialogMessage = document.getElementById("ticketDialogMessage");
    const statusSelect = document.getElementById("ticketEditStatus") as HTMLSelectElement | null;
    const reasonInput = document.getElementById("ticketStatusReason") as HTMLTextAreaElement | null;
    const saveStatusButton = document.getElementById("saveTicketStatus") as HTMLButtonElement | null;
    const selectedTicketReference = document.getElementById("selectedTicketReference");
    const selectedTicketRequester = document.getElementById("selectedTicketRequester");
    const selectedTicketCategory = document.getElementById("selectedTicketCategory");
    const selectedTicketCurrentStatus = document.getElementById("selectedTicketCurrentStatus");
    const selectedTicketDescription = document.getElementById("selectedTicketDescription");
    const selectedTicketCreatedAt = document.getElementById("selectedTicketCreatedAt");
    const closeTicketDialog = document.getElementById("closeTicketDialog") as HTMLButtonElement | null;
    const cancelTicketDialog = document.getElementById("cancelTicketDialog") as HTMLButtonElement | null;

    if (
        !panel || !tableBody || !message || !dashboardTitle || !dashboardDescription ||
        !searchInput || !statusFilter ||
        !paginationSummary || !previousButton || !nextButton || !refreshButton ||
        !ticketDialog || !ticketForm || !dialogMessage || !statusSelect || !reasonInput ||
        !saveStatusButton || !selectedTicketReference || !selectedTicketRequester ||
        !selectedTicketCategory || !selectedTicketCurrentStatus || !selectedTicketDescription ||
        !selectedTicketCreatedAt || !closeTicketDialog || !cancelTicketDialog
    ) {
        return;
    }

    let page = 1;
    let totalPages = 0;
    let searchTimer = 0;
    let activeRequest = 0;
    let selectedTicket: ContractorTicket | null = null;

    const showMessage = (text: string, success = false): void => {
        message.textContent = text;
        message.classList.toggle("success", success);
    };
    const formatStatus = (status: string): string => status.replaceAll("_", " ");
    const statusClass = (status: string): string =>
        `ticket-status status-${status.toLowerCase().replaceAll("_", "-")}`;

    const openTicketDialog = (ticket: ContractorTicket): void => {
        selectedTicket = ticket;
        selectedTicketReference.textContent = ticket.tracking_ref;
        selectedTicketRequester.textContent = ticket.requester_name;
        selectedTicketCategory.textContent = ticket.category_name;
        selectedTicketCurrentStatus.textContent = formatStatus(ticket.status);
        selectedTicketCurrentStatus.className = statusClass(ticket.status);
        selectedTicketDescription.textContent = ticket.description;
        const submittedAt = new Date(ticket.created_at);
        selectedTicketCreatedAt.textContent = Number.isNaN(submittedAt.getTime())
            ? ticket.created_at
            : submittedAt.toLocaleString();
        statusSelect.value = ticket.status;
        reasonInput.value = "";
        dialogMessage.textContent = "";
        ticketDialog.showModal();
        statusSelect.focus();
    };

    const renderTickets = (tickets: ContractorTicket[]): void => {
        tableBody.replaceChildren();
        if (tickets.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.textContent = "No assigned tickets match these filters.";
            row.append(cell);
            tableBody.append(row);
            return;
        }

        for (const ticket of tickets) {
            const row = document.createElement("tr");
            row.className = "ticket-row";
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-label", `Update ticket ${ticket.tracking_ref}`);
            row.addEventListener("click", () => openTicketDialog(ticket));
            row.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTicketDialog(ticket);
                }
            });

            const reference = document.createElement("td");
            reference.className = "ticket-reference";
            reference.textContent = ticket.tracking_ref;
            const requester = document.createElement("td");
            requester.textContent = ticket.requester_name;
            const category = document.createElement("td");
            category.textContent = ticket.category_name;
            const description = document.createElement("td");
            description.textContent = ticket.description;
            const status = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `${statusClass(ticket.status)}`;
            badge.textContent = formatStatus(ticket.status);
            status.append(badge);
            const contractor = document.createElement("td");
            contractor.textContent = ticket.contractor_name ?? "Unassigned";
            const createdAt = document.createElement("td");
            const date = new Date(ticket.created_at);
            createdAt.textContent = Number.isNaN(date.getTime())
                ? ticket.created_at
                : date.toLocaleString();
            row.append(reference, requester, category, description, status, contractor, createdAt);
            tableBody.append(row);
        }
    };

    const loadTickets = async (): Promise<void> => {
        const requestId = ++activeRequest;
        showMessage("Loading assigned tickets...");
        previousButton.disabled = true;
        nextButton.disabled = true;
        const parameters = new URLSearchParams({
            page: String(page),
            search: searchInput.value.trim(),
            status: statusFilter.value
        });
        try {
            const response = await fetch(`/api/tickets/assigned?${parameters.toString()}`);
            const data: ContractorTicketListResponse = await response.json();
            if (requestId !== activeRequest) {
                return;
            }
            if (!response.ok || !data.success || !data.tickets || !data.pagination) {
                throw new Error(data.message ?? `Failed to load assigned tickets (${response.status}).`);
            }

            if (data.viewMode === "admin") {
                dashboardTitle.textContent = "Contractor Tickets";
                dashboardDescription.textContent =
                    "Review tickets assigned to contractors and update their status. The requester is emailed when a status changes.";
            }
            renderTickets(data.tickets);
            page = data.pagination.page;
            totalPages = data.pagination.totalPages;
            paginationSummary.textContent = data.pagination.total === 0
                ? "No assigned tickets"
                : `Page ${page} of ${Math.max(totalPages, 1)} · ${data.pagination.total} ticket${data.pagination.total === 1 ? "" : "s"}`;
            previousButton.disabled = page <= 1;
            nextButton.disabled = page >= totalPages;
            showMessage("");
        } catch (error) {
            if (requestId !== activeRequest) {
                return;
            }
            renderTickets([]);
            paginationSummary.textContent = "Assigned tickets could not be loaded.";
            showMessage(error instanceof Error ? error.message : "Failed to load assigned tickets.");
        }
    };

    panel.hidden = false;
    await loadTickets();

    searchInput.addEventListener("input", () => {
        if (headerSearchInput) {
            headerSearchInput.value = searchInput.value;
        }
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            page = 1;
            void loadTickets();
        }, 250);
    });
    headerSearchInput?.addEventListener("input", () => {
        searchInput.value = headerSearchInput.value;
        searchInput.dispatchEvent(new Event("input"));
    });
    statusFilter.addEventListener("change", () => {
        page = 1;
        void loadTickets();
    });
    refreshButton.addEventListener("click", () => void loadTickets());
    previousButton.addEventListener("click", () => {
        if (page > 1) {
            page -= 1;
            void loadTickets();
        }
    });
    nextButton.addEventListener("click", () => {
        if (page < totalPages) {
            page += 1;
            void loadTickets();
        }
    });

    const closeDialog = (): void => {
        ticketDialog.close();
        selectedTicket = null;
    };
    closeTicketDialog.addEventListener("click", closeDialog);
    cancelTicketDialog.addEventListener("click", closeDialog);
    ticketDialog.addEventListener("click", (event: MouseEvent) => {
        if (event.target === ticketDialog) {
            closeDialog();
        }
    });

    ticketForm.addEventListener("submit", async (event: SubmitEvent) => {
        event.preventDefault();
        if (!selectedTicket) {
            return;
        }
        if (statusSelect.value === selectedTicket.status) {
            dialogMessage.textContent = "Choose a different status before saving.";
            return;
        }
        if (!reasonInput.value.trim()) {
            dialogMessage.textContent = "A reason is required when changing ticket status.";
            reasonInput.focus();
            return;
        }

        dialogMessage.textContent = "";
        saveStatusButton.disabled = true;
        try {
            const response = await fetch(
                `/api/tickets/${encodeURIComponent(selectedTicket.ticket_id)}/status`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        status: statusSelect.value,
                        reason: reasonInput.value.trim()
                    })
                }
            );
            const data: ContractorStatusUpdateResponse = await response.json();
            if (!response.ok || !data.success || !data.ticket) {
                throw new Error(data.message ?? "Unable to update ticket status.");
            }

            const notification = data.notification;
            closeDialog();
            await loadTickets();
            showMessage(
                notification?.message ??
                    "Ticket status was updated, but the email delivery result was not reported.",
                notification?.sent === true
            );
        } catch (error) {
            console.error("Error updating assigned ticket status:", error);
            dialogMessage.textContent = error instanceof Error
                ? error.message
                : "Unable to update ticket status.";
        } finally {
            saveStatusButton.disabled = false;
        }
    });
}
