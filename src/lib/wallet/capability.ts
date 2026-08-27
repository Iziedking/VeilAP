import { compareVersions } from "starknet";

export const MINIMUM_STRK20_WALLET_API = "0.10.3" as const;

export function supportsStrk20(versions: readonly string[]): boolean {
  return versions.some(
    (version) => compareVersions(version, MINIMUM_STRK20_WALLET_API) >= 0,
  );
}
