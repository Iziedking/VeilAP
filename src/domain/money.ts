export type MinorUnits = bigint;

export function parseDecimalToMinor(value: string, decimals: number): MinorUnits {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("DECIMALS_INVALID");
  }

  const normalized = value.replaceAll(",", "");
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error("MONEY_FORMAT_INVALID");

  const fraction = match[2] ?? "";
  if (fraction.length > decimals) throw new Error("MONEY_PRECISION_INVALID");

  const factor = 10n ** BigInt(decimals);
  const wholeMinor = BigInt(match[1]) * factor;
  const fractionMinor = fraction.length === 0
    ? 0n
    : BigInt(fraction.padEnd(decimals, "0"));

  return wholeMinor + fractionMinor;
}

export function computeRoyalty(
  revenueMinor: MinorUnits,
  royaltyBps: number,
): MinorUnits {
  if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > 10_000) {
    throw new Error("ROYALTY_BPS_INVALID");
  }
  if (revenueMinor < 0n) throw new Error("REVENUE_NEGATIVE");

  return revenueMinor * BigInt(royaltyBps) / 10_000n;
}
