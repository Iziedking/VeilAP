const API_ORIGIN_ENV = "NEXT_PUBLIC_VEIL_API_ORIGIN";

function configuredApiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_VEIL_API_ORIGIN?.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("unsupported protocol");
    return parsed.origin;
  } catch {
    throw new Error(`${API_ORIGIN_ENV}_INVALID`);
  }
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API_PATH_INVALID");
  }
  const origin = configuredApiOrigin();
  return origin ? `${origin}${path}` : path;
}

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
  });
}
