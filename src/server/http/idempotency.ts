const idempotencyKeyPattern = /^[\x21-\x7e]{8,200}$/;

export function readIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get("idempotency-key")?.trim();
  return value && idempotencyKeyPattern.test(value) ? value : undefined;
}
