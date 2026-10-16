interface ReportAnalytics {
    total_reports: number;
    reports_today: number;
    open_reports: number;
    resolved_reports: number;
    categories: Array<{
        category_name: string;
        report_count: number;
    }>;
    statuses: Array<{
        status: string;
        report_count: number;
    }>;
    daily_reports: Array<{
        report_date: string;
        report_count: number;
    }>;
}

interface ReportAnalyticsResponse {
    success: boolean;
    message?: string;
    analytics?: ReportAnalytics;
}

function formatStatus(status: string): string {
    return status.replaceAll("_", " ");
}

function renderBreakdown(
    container: HTMLElement,
    items: Array<{ label: string; count: number }>,
    emptyMessage: string
): void {
    container.replaceChildren();
    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "analytics-empty";
        empty.textContent = emptyMessage;
        container.append(empty);
        return;
    }

    const maximum = Math.max(...items.map((item) => item.count), 1);
    for (const item of items) {
        const row = document.createElement("div");
        row.className = "breakdown-row";
        const heading = document.createElement("div");
        heading.className = "breakdown-heading";
        const label = document.createElement("span");
        label.textContent = item.label;
        const count = document.createElement("strong");
        count.textContent = item.count.toLocaleString();
        heading.append(label, count);
        const track = document.createElement("div");
        track.className = "breakdown-track";
        track.setAttribute("aria-hidden", "true");
        const bar = document.createElement("span");
        bar.className = "breakdown-bar";
        bar.style.width = `${item.count === 0 ? 0 : Math.max((item.count / maximum) * 100, 2)}%`;
        track.append(bar);
        row.append(heading, track);
        container.append(row);
    }
}

function renderDailyReports(container: HTMLElement, days: ReportAnalytics["daily_reports"]): void {
    container.replaceChildren();
    const maximum = Math.max(...days.map((day) => day.report_count), 1);
    for (const day of days) {
        const column = document.createElement("div");
        column.className = "daily-column";
        const count = document.createElement("span");
        count.className = "daily-count";
        count.textContent = day.report_count.toLocaleString();
        const track = document.createElement("div");
        track.className = "daily-track";
        const bar = document.createElement("span");
        bar.className = "daily-bar";
        bar.style.height = `${day.report_count === 0 ? 2 : Math.max((day.report_count / maximum) * 100, 4)}%`;
        track.append(bar);
        const date = new Date(`${day.report_date}T00:00:00`);
        const label = document.createElement("span");
        label.className = "daily-label";
        label.textContent = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
        label.title = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
        }).format(date);
        column.append(count, track, label);
        container.append(column);
    }
}

async function loadAnalytics(): Promise<void> {
    const message = document.getElementById("analyticsMessage");
    const refreshButton = document.getElementById("refreshAnalytics") as HTMLButtonElement | null;
    const summary = document.getElementById("analyticsSummary");
    const categoryList = document.getElementById("categoryBreakdown");
    const statusList = document.getElementById("statusBreakdown");
    const dailyChart = document.getElementById("dailyReportsChart");
    if (!message || !refreshButton || !summary || !categoryList || !statusList || !dailyChart) {
        return;
    }

    message.textContent = "Loading report analytics...";
    summary.hidden = true;
    refreshButton.disabled = true;
    try {
        const response = await fetch("/api/reports/analytics");
        const data: ReportAnalyticsResponse = await response.json();
        if (!response.ok || !data.success || !data.analytics) {
            throw new Error(data.message || "Failed to load report analytics.");
        }

        const analytics = data.analytics;
        for (const [id, value] of [
            ["totalReports", analytics.total_reports],
            ["reportsToday", analytics.reports_today],
            ["openReports", analytics.open_reports],
            ["resolvedReports", analytics.resolved_reports]
        ] as const) {
            const element = document.getElementById(id);
            if (element) element.textContent = value.toLocaleString();
        }
        renderBreakdown(
            categoryList,
            analytics.categories.map((category) => ({
                label: category.category_name,
                count: category.report_count
            })),
            "No service categories found."
        );
        renderBreakdown(
            statusList,
            analytics.statuses.map((status) => ({
                label: formatStatus(status.status),
                count: status.report_count
            })),
            "No report statuses found."
        );
        renderDailyReports(dailyChart, analytics.daily_reports);
        summary.hidden = false;
        message.textContent = "";
    } catch (error) {
        console.error("Unable to load report analytics:", error);
        message.textContent = error instanceof Error
            ? error.message
            : "Failed to load report analytics.";
    } finally {
        refreshButton.disabled = false;
    }
}

document.getElementById("refreshAnalytics")?.addEventListener("click", () => {
    void loadAnalytics();
});

void loadAnalytics();
