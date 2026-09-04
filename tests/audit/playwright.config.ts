import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Opt-in failure probes. Keep these separate from the existing happy-path suite
// so the audit can report its failures without silently changing release gates.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "*.audit.ts",
  outputDir: "../../test-results/promise-audit",
  projects: [{ name: "promise-audit", use: { viewport: { width: 1440, height: 900 } } }],
});
