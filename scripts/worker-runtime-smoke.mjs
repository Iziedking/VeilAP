import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const directory = resolve("test-results/worker-smoke");
await mkdir(directory, { recursive: true });
const healthFile = resolve(directory, "health.json");
let requests = 0;
const sockets = new Set();
const server = createServer((_request, response) => {
  requests++;
  if (requests === 1) return; // Force the real daemon's HTTP deadline.
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, value: { status: "idle", projectId: "", seasonId: "" } }));
});
server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const env = { ...process.env, VEILAP_ARENA_WORKER_API_URL: `http://127.0.0.1:${address.port}`, VEILAP_ARENA_WORKER_SECRET: "test-only-".repeat(8), VEILAP_ARENA_WORKER_REQUEST_TIMEOUT_MS: "250", VEILAP_ARENA_WORKER_ERROR_BACKOFF_MS: "1000", VEILAP_ARENA_WORKER_IDLE_POLL_MS: "500", VEILAP_ARENA_WORKER_HEALTH_FILE: healthFile };
const waitFor = async predicate => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error("WORKER_SMOKE_TIMEOUT");
};
let child;
const stop = async () => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM"); await exited;
};
try {
  for (let run = 0; run < 2; run++) {
    const before = requests;
    child = spawn(process.execPath, ["scripts/arena-worker.mjs"], { env, windowsHide: true, stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", data => { stderr += data.toString(); });
    child.stdout.resume();
    await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`WORKER_EXIT_${child.exitCode}:${stderr}`);
      try { return requests > Math.max(1, before) && JSON.parse(await readFile(healthFile, "utf8")).status === "idle"; } catch { return false; }
    });
    await stop();
  }
  assert.ok(requests >= 3);
  console.log(JSON.stringify({ timeoutRecovery: "PASS", processRestart: "PASS", healthHeartbeat: "PASS", requests }));
} finally { await stop(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
