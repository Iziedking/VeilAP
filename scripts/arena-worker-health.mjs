import { readFile } from "node:fs/promises";
try {
  const state = JSON.parse(await readFile(process.env.VEILAP_ARENA_WORKER_HEALTH_FILE || "/tmp/veil-arena-worker-health.json", "utf8"));
  const age = Date.now() - state.lastResponseAt;
  process.exitCode = Number.isFinite(age) && age >= 0 && age < 180_000 && state.status !== "failed" ? 0 : 1;
} catch { process.exitCode = 1; }
