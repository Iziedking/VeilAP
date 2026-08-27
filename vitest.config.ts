import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    passWithNoTests: true,
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
