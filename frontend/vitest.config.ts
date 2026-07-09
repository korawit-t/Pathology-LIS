import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
    css: false,
    // CI runners are ~3x slower than local; the antd modal/interaction suites
    // (e.g. AnatomicalPathologyTestPage) exceed the 5s default there. Match the
    // 15s several tests already set inline, applied globally to avoid flakiness.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/setupTests.ts"],
    },
  },
});
