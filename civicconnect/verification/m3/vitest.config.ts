import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["verification/m3/**/*.test.ts"],
        testTimeout: 10_000,
        hookTimeout: 10_000,
        reporters: ["default"]
    }
});
