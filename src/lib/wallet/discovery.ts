import { createStore, type Store } from "@starknet-io/get-starknet-discovery";

let discoveryStore: Store | undefined;

export function getWalletDiscovery(): Store {
  if (typeof window === "undefined") {
    throw new Error("WALLET_DISCOVERY_BROWSER_ONLY");
  }
  // get-starknet-discovery@6.0.2, src/store.ts, read 2026-08-27.
  discoveryStore ??= createStore();
  return discoveryStore;
}
