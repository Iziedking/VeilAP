import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Bound process contention; concurrency probes still race requests inside each test.
    maxWorkers: 4,
    setupFiles: ["src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    passWithNoTests: true,
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
