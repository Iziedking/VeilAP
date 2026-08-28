export function sameFeltAddress(left: string, right: string): boolean {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
}

export function normalizeFeltAddress(value: string): string | undefined {
  try {
    const felt = BigInt(value);
    if (felt < 0n) return undefined;
    return `0x${felt.toString(16)}`;
  } catch {
    return undefined;
  }
}
