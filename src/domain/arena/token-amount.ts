/**
 * Convert a user-facing decimal token amount into the exact integer amount
 * required by the settlement protocol. This intentionally avoids Number so
 * values such as 0.29 cannot be rounded before signing.
 */
export function parseTokenAmountToMinor(value: string, decimals: number): string | null {
  const normalized = value.trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const digits = `${whole}${fraction.padEnd(decimals, "0")}`;
  const minor = BigInt(digits || "0");
  return minor > 0n ? minor.toString() : null;
}

export function formatTokenAmountFromMinor(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !/^\d+$/.test(value)) return "Unavailable";
  const minor = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}
