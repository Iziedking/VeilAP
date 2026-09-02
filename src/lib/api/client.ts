const API_ORIGIN_ENV = "NEXT_PUBLIC_VEIL_API_ORIGIN";
// Deployed browser builds use the fixed HTTPS API origin when the Vercel
// public variable is missing. Local and CI browser builds remain same-origin.
const PRODUCTION_API_ORIGIN = "https://api.veilap.xyz";

function configuredApiOrigin(): string {
  const value = process.env.NEXT_PUBLIC_VEIL_API_ORIGIN?.trim();
  if (!value) {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
        return "";
      }
    }
    return process.env.NODE_ENV === "production" ? PRODUCTION_API_ORIGIN : "";
  }

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
