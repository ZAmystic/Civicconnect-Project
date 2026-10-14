import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    reporter: [["list"], ["html", { outputFolder: "evidence/playwright-report", open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:4173",
        browserName: "chromium",
        headless: true
    },
    webServer: {
        command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173/src/pages/dashboard.html",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    }
});
