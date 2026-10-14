interface AuditLog {
    log_id: string;
    ticket_id: string;
    tracking_ref: string;
    actor_name: string;
    actor_role: string;
    previous_status: string | null;
    new_status: string;
    change_reason: string;
    timestamp: string;
}

interface AuditLogResponse {
    success: boolean;
    message?: string;
    logs?: AuditLog[];
    pagination?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    };
}

let currentPage = 1;
let searchTimer: number | undefined;
let activeRequest = 0;

const rows = document.querySelector<HTMLTableSectionElement>("#auditLogRows");
const countElement = document.querySelector<HTMLElement>("#auditLogCount");
const messageElement = document.querySelector<HTMLElement>("#auditLogMessage");
const emptyElement = document.querySelector<HTMLElement>("#auditLogEmpty");
const pageSummary = document.querySelector<HTMLElement>("#auditLogPageSummary");
const previousButton = document.querySelector<HTMLButtonElement>("#auditLogPrevious");
const nextButton = document.querySelector<HTMLButtonElement>("#auditLogNext");
const refreshButton = document.querySelector<HTMLButtonElement>("#refreshAuditLogs");
const searchInput = document.querySelector<HTMLInputElement>("#auditLogSearch");
const statusFilter = document.querySelector<HTMLSelectElement>("#auditLogStatus");

function formatStatus(status: string | null): string {
    if (!status) {
        return "Created";
    }
    return status.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
}

function createCell(className: string, text: string): HTMLTableCellElement {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text;
    return cell;
}

function renderLogs(logs: AuditLog[]): void {
    if (!rows || !emptyElement) {
        return;
    }

    const tableRows = logs.map((log) => {
        const row = document.createElement("tr");

        const timeCell = document.createElement("td");
        const time = document.createElement("time");
        time.className = "audit-log-time";
        time.dateTime = log.timestamp;
        time.textContent = formatTimestamp(log.timestamp);
        timeCell.append(time);

        const actorCell = createCell("audit-log-actor", log.actor_name || "Unknown user");
        const actorRole = document.createElement("span");
        actorRole.className = "audit-log-role";
        actorRole.textContent = log.actor_role;
        actorCell.append(actorRole);

        const ticketCell = document.createElement("td");
        const ticketReference = document.createElement("span");
        ticketReference.className = "audit-log-ticket";
        ticketReference.textContent = log.tracking_ref;
        ticketCell.append(ticketReference);

        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        const statusClass = log.new_status.toLowerCase().replaceAll("_", "-");
        status.className = `audit-log-status audit-log-status-${statusClass}`;
        status.textContent = log.previous_status === log.new_status
            ? `${formatStatus(log.new_status)} · details updated`
            : `${formatStatus(log.previous_status)} to ${formatStatus(log.new_status)}`;
        statusCell.append(status);

        row.append(
            timeCell,
            actorCell,
            ticketCell,
            statusCell,
            createCell("audit-log-reason", log.change_reason)
        );
        return row;
    });

    rows.replaceChildren(...tableRows);
    emptyElement.hidden = logs.length > 0;
}

async function loadAuditLogs(): Promise<void> {
    if (
        !rows ||
        !countElement ||
        !messageElement ||
        !pageSummary ||
        !previousButton ||
        !nextButton
    ) {
        return;
    }

    const requestId = ++activeRequest;
    messageElement.textContent = "";
    messageElement.classList.remove("error");
    if (refreshButton) {
        refreshButton.disabled = true;
    }

    const query = new URLSearchParams({
        page: String(currentPage),
        ...(searchInput?.value.trim() ? { search: searchInput.value.trim() } : {}),
        ...(statusFilter?.value ? { status: statusFilter.value } : {})
    });

    try {
        const response = await fetch(`/api/audit-logs?${query.toString()}`);
        const data: AuditLogResponse = await response.json();
        if (!response.ok || !data.success || !data.logs || !data.pagination) {
            throw new Error(data.message || "Unable to load audit logs.");
        }
        if (requestId !== activeRequest) {
            return;
        }

        renderLogs(data.logs);
        const { page, pageSize: responsePageSize, total, totalPages } = data.pagination;
        countElement.textContent =
            `${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}`;
        pageSummary.textContent =
            `Page ${page} of ${Math.max(totalPages, 1)} · ${responsePageSize} per page`;
        previousButton.disabled = page <= 1;
        nextButton.disabled = page >= totalPages;
    } catch (error) {
        if (requestId !== activeRequest) {
            return;
        }
        console.error("Unable to load audit logs:", error);
        rows.replaceChildren();
        if (emptyElement) {
            emptyElement.hidden = true;
        }
        countElement.textContent = "Audit activity could not be loaded.";
        messageElement.textContent = error instanceof Error
            ? error.message
            : "Unable to load audit logs.";
        messageElement.classList.add("error");
    } finally {
        if (requestId === activeRequest && refreshButton) {
            refreshButton.disabled = false;
        }
    }
}

document.querySelector<HTMLFormElement>("#auditLogFilters")?.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();
        currentPage = 1;
        void loadAuditLogs();
    }
);

searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
        currentPage = 1;
        void loadAuditLogs();
    }, 250);
});

statusFilter?.addEventListener("change", () => {
    currentPage = 1;
    void loadAuditLogs();
});

refreshButton?.addEventListener("click", () => {
    void loadAuditLogs();
});

previousButton?.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    void loadAuditLogs();
});

nextButton?.addEventListener("click", () => {
    currentPage += 1;
    void loadAuditLogs();
});

void loadAuditLogs();
