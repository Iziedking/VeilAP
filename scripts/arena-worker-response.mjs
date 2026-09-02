export function parseWorkerTickResult(body) {
  if (!body || typeof body !== "object" || body.ok !== true) {
    const code = body && typeof body === "object" && "code" in body ? body.code : "WORKER_TICK_FAILED";
    throw new Error(String(code));
  }

  const result = body.value;
  if (!result || typeof result !== "object" || typeof result.status !== "string") {
    throw new Error("WORKER_TICK_RESPONSE_INVALID");
  }

  return result;
}
