interface TicketListResponse {
    success: boolean;
    message?: string;
    tickets?: Ticket[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

interface Ticket {
    ticket_id: string;
    tracking_ref: string;
    requester_name: string;
    category_name: string;
    description: string;
    status: string;
    created_at: string;
    contractor_user_id: number | null;
    contractor_name: string | null;
}

interface TicketAdminUserResponse {
    success: boolean;
    user?: {
        canViewAuditLogs: boolean;
    };
}

interface Contractor {
    user_id: number;
    full_name: string;
}

interface ContractorListResponse {
    success: boolean;
    message?: string;
    contractors?: Contractor[];
}

interface TicketStatusUpdateResponse {
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
    assignment?: {
        contractor_user_id: number;
        contractor_name: string;
    };
}

export async function initializeTicketAdmin(): Promise<void> {
    const panel = document.getElementById("ticketAdminPanel");
    const tableBody = document.getElementById("ticketTableBody");
    const message = document.getElementById("ticketAdminMessage");
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
    const contractorSelect = document.getElementById("ticketContractorSelect") as HTMLSelectElement | null;
    const assignmentHelp = document.getElementById("ticketAssignmentHelp");
    const selectedTicketReference = document.getElementById("selectedTicketReference");
    const selectedTicketRequester = document.getElementById("selectedTicketRequester");
    const selectedTicketCategory = document.getElementById("selectedTicketCategory");
    const selectedTicketCurrentStatus = document.getElementById("selectedTicketCurrentStatus");
    const selectedTicketDescription = document.getElementById("selectedTicketDescription");
    const selectedTicketCreatedAt = document.getElementById("selectedTicketCreatedAt");
    const selectedTicketContractor = document.getElementById("selectedTicketContractor");
    const closeTicketDialog = document.getElementById("closeTicketDialog") as HTMLButtonElement | null;
    const cancelTicketDialog = document.getElementById("cancelTicketDialog") as HTMLButtonElement | null;
    if (
        !panel || !tableBody || !message || !searchInput || !statusFilter ||
        !paginationSummary || !previousButton || !nextButton || !refreshButton ||
        !ticketDialog || !ticketForm || !dialogMessage || !statusSelect || !reasonInput ||
        !saveStatusButton || !contractorSelect || !assignmentHelp ||
        !selectedTicketReference || !selectedTicketRequester ||
        !selectedTicketCategory || !selectedTicketCurrentStatus || !selectedTicketDescription ||
        !selectedTicketCreatedAt || !selectedTicketContractor ||
        !closeTicketDialog || !cancelTicketDialog
    ) {
        return;
    }

    let page = 1;
    let totalPages = 0;
    let searchTimer = 0;
    let activeRequest = 0;
    let selectedTicket: Ticket | null = null;
    let contractors: Contractor[] = [];

    const showMessage = (text: string): void => {
        message.textContent = text;
    };

    const statusClass = (status: string): string =>
        `status-${status.toLowerCase().replaceAll("_", "-")}`;
    const formatStatus = (status: string): string =>
        status.replaceAll("_", " ");

    const renderTickets = (tickets: Ticket[]): void => {
        tableBody.replaceChildren();
        if (tickets.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.textContent = "No tickets match these filters.";
            row.append(cell);
            tableBody.append(row);
            return;
        }

        for (const ticket of tickets) {
            const row = document.createElement("tr");
            row.className = "ticket-row";
            row.tabIndex = 0;
            row.setAttribute("role", "button");
            row.setAttribute("aria-label", `View ticket ${ticket.tracking_ref}`);
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
            const statusBadge = document.createElement("span");
            statusBadge.className = `ticket-status ${statusClass(ticket.status)}`;
            statusBadge.textContent = formatStatus(ticket.status);
            status.append(statusBadge);
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

    const openTicketDialog = (ticket: Ticket): void => {
        selectedTicket = ticket;
        selectedTicketReference.textContent = ticket.tracking_ref;
        selectedTicketRequester.textContent = ticket.requester_name;
        selectedTicketCategory.textContent = ticket.category_name;
        selectedTicketCurrentStatus.textContent = formatStatus(ticket.status);
        selectedTicketCurrentStatus.className = `ticket-status ${statusClass(ticket.status)}`;
        selectedTicketDescription.textContent = ticket.description;
        selectedTicketContractor.textContent = ticket.contractor_name ?? "Unassigned";
        const submittedAt = new Date(ticket.created_at);
        selectedTicketCreatedAt.textContent = Number.isNaN(submittedAt.getTime())
            ? ticket.created_at
            : submittedAt.toLocaleString();
        statusSelect.value = ticket.status;
        contractorSelect.value = "";
        assignmentHelp.textContent = contractors.length === 0
            ? "No active contractor accounts are available. Ask an Admin or Manager to add or activate a Contractor account. Status changes can still be saved."
            : ticket.contractor_name
                ? `Currently assigned to ${ticket.contractor_name}. Choose a contractor to assign or change the assignment; leave this unchanged to keep it.`
                : "Choose an active contractor to assign this ticket, or leave it unchanged to save only the status.";
        reasonInput.value = "";
        dialogMessage.textContent = "";
        ticketDialog.showModal();
        statusSelect.focus();
    };

    const closeDialog = (): void => {
        ticketDialog.close();
        selectedTicket = null;
    };

    const loadTickets = async (): Promise<void> => {
        const requestId = ++activeRequest;
        showMessage("Loading tickets...");
        previousButton.disabled = true;
        nextButton.disabled = true;
        const parameters = new URLSearchParams({
            page: String(page),
            search: searchInput.value.trim(),
            status: statusFilter.value
        });
        try {
            const response = await fetch(`/api/tickets?${parameters.toString()}`);
            const data: TicketListResponse = await response.json();
            if (requestId !== activeRequest) {
                return;
            }
            if (!response.ok || !data.success || !data.tickets || !data.pagination) {
                throw new Error(data.message ?? `Failed to load tickets (${response.status}).`);
            }

            renderTickets(data.tickets);
            page = data.pagination.page;
            totalPages = data.pagination.totalPages;
            paginationSummary.textContent = data.pagination.total === 0
                ? "No tickets"
                : `Page ${page} of ${Math.max(totalPages, 1)} · ${data.pagination.total} ticket${data.pagination.total === 1 ? "" : "s"}`;
            previousButton.disabled = page <= 1;
            nextButton.disabled = page >= totalPages;
            showMessage("");
        } catch (error) {
            if (requestId !== activeRequest) {
                return;
            }
            renderTickets([]);
            paginationSummary.textContent = "Tickets could not be loaded.";
            showMessage(error instanceof Error ? error.message : "Failed to load tickets.");
        }
    };

    try {
        const response = await fetch("/api/users/me");
        if (!response.ok) {
            return;
        }
        const userData: TicketAdminUserResponse = await response.json();
        if (!userData.success || !userData.user?.canViewAuditLogs) {
            return;
        }
        panel.hidden = false;
        try {
            const contractorResponse = await fetch("/api/tickets/contractors");
            const contractorData: ContractorListResponse = await contractorResponse.json();
            if (!contractorResponse.ok || !contractorData.success || !contractorData.contractors) {
                throw new Error(contractorData.message ?? "Unable to load contractors.");
            }
            contractors = contractorData.contractors;
            contractorSelect.replaceChildren();
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = contractors.length
                ? "No contractor change"
                : "No active contractor accounts";
            contractorSelect.append(placeholder);
            for (const contractor of contractors) {
                const option = document.createElement("option");
                option.value = String(contractor.user_id);
                option.textContent = contractor.full_name;
                contractorSelect.append(option);
            }
        } catch (error) {
            console.error("Unable to load active contractors:", error);
            showMessage(error instanceof Error ? error.message : "Unable to load contractors.");
        }
        void loadTickets();
    } catch (error) {
        console.error("Unable to verify access to the ticket dashboard:", error);
        return;
    }

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

        dialogMessage.textContent = "";
        saveStatusButton.disabled = true;
        try {
            const response = await fetch(`/api/tickets/${encodeURIComponent(selectedTicket.ticket_id)}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: statusSelect.value,
                    reason: reasonInput.value.trim(),
                    ...(contractorSelect.value
                        ? { contractorId: Number(contractorSelect.value) }
                        : {})
                })
            });
            const data: TicketStatusUpdateResponse = await response.json();
            if (!response.ok || !data.success || !data.ticket) {
                throw new Error(data.message ?? "Unable to update ticket status.");
            }

            selectedTicket.status = data.ticket.status;
            if (data.assignment) {
                selectedTicket.contractor_user_id = data.assignment.contractor_user_id;
                selectedTicket.contractor_name = data.assignment.contractor_name;
            }
            closeDialog();
            await loadTickets();
            if (data.notification) {
                showMessage(data.notification.message);
            }
        } catch (error) {
            console.error("Error updating ticket status:", error);
            dialogMessage.textContent = error instanceof Error
                ? error.message
                : "Unable to update ticket status.";
        } finally {
            saveStatusButton.disabled = false;
        }
    });
}
