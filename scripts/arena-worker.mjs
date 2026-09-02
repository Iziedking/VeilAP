const apiUrl = (process.env.VEILAP_ARENA_WORKER_API_URL || "http://app:3000").replace(/\/$/, "");
const workerSecret = process.env.VEILAP_ARENA_WORKER_SECRET || "";
const pollMs = boundedInteger(process.env.VEILAP_ARENA_WORKER_POLL_MS, 1000, 250, 10000);
const idlePollMs = boundedInteger(process.env.VEILAP_ARENA_WORKER_IDLE_POLL_MS, 2500, 500, 30000);
const errorBackoffMs = boundedInteger(process.env.VEILAP_ARENA_WORKER_ERROR_BACKOFF_MS, 5000, 1000, 60000);

if (workerSecret.length < 64) {
  console.error("[arena-worker] VEILAP_ARENA_WORKER_SECRET must contain at least 64 characters");
  process.exit(1);
}

let stopping = false;
let activeRequest;
let lastState = "";
const waiters = new Set();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopping = true;
    activeRequest?.abort();
    for (const resolve of waiters) resolve();
    waiters.clear();
  });
}

console.log(`[arena-worker] polling ${apiUrl}/api/internal/arena/worker/tick every ${pollMs}ms`);

while (!stopping) {
  let delay = idlePollMs;
  try {
    const result = await tick();
    if (result.status === "completed") {
      console.log(`[arena-worker] completed ${result.scheduledMatchId || "scheduled match"}`);
      delay = pollMs;
    } else if (result.status === "in_progress") {
      logState("in_progress", "another worker currently owns the next match");
      delay = pollMs;
    } else if (result.status === "idle") {
      logState("idle", "no locked competition is waiting for execution");
    } else {
      logState(`failed:${result.errorCode || "unknown"}`, "worker tick returned a failure");
      delay = errorBackoffMs;
    }
  } catch (error) {
    if (stopping) break;
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[arena-worker] tick unavailable: ${message}; retrying in ${errorBackoffMs}ms`);
    delay = errorBackoffMs;
  }
  await wait(delay);
}

console.log("[arena-worker] shutdown complete");

async function tick() {
  activeRequest = new AbortController();
  try {
    const response = await fetch(`${apiUrl}/api/internal/arena/worker/tick`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-veil-arena-worker-secret": workerSecret,
      },
      body: "{}",
      signal: activeRequest.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP_${response.status}_${body.code || "WORKER_TICK_FAILED"}`);
    return body;
  } finally {
    activeRequest = undefined;
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function logState(state, message) {
  if (lastState === state) return;
  lastState = state;
  console.log(`[arena-worker] ${message}`);
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    if (stopping) {
      resolve();
      return;
    }
    let timer;
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve();
    };
    waiters.add(done);
    timer = setTimeout(done, milliseconds);
  });
}
