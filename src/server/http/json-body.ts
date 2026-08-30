const DEFAULT_MAX_BYTES = 32 * 1024;

export class JsonBodyError extends Error {
  readonly code: "CONTENT_TYPE_REQUIRED" | "REQUEST_BODY_TOO_LARGE" | "INVALID_JSON";
  readonly status: 400 | 413 | 415;

  constructor(code: JsonBodyError["code"], status: JsonBodyError["status"]) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function jsonBodyErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof JsonBodyError)) return undefined;
  return Response.json({ ok: false, code: error.code }, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || mediaType?.endsWith("+json") === true;
}

export async function readJsonBody(request: Request, maxBytes = DEFAULT_MAX_BYTES): Promise<unknown> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("JSON_BODY_LIMIT_INVALID");
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new JsonBodyError("CONTENT_TYPE_REQUIRED", 415);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw new JsonBodyError("INVALID_JSON", 400);
    if (parsedLength > maxBytes) throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
  }
  if (!request.body) throw new JsonBodyError("INVALID_JSON", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new JsonBodyError("REQUEST_BODY_TOO_LARGE", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new JsonBodyError("INVALID_JSON", 400);
  }
}
