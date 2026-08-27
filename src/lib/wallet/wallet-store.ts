"use client";

import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { useSyncExternalStore } from "react";

import { getWalletDiscovery } from "./discovery";

const EMPTY: readonly WalletWithStarknetFeatures[] = [];
const listeners = new Set<() => void>();
let snapshot = EMPTY;
let stopDiscovery: (() => void) | undefined;

function startDiscovery() {
  if (stopDiscovery || typeof window === "undefined") return;
  const discovery = getWalletDiscovery();
  snapshot = discovery.getWallets();
  stopDiscovery = discovery.subscribe((wallets) => {
    snapshot = wallets;
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startDiscovery();
  listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopDiscovery?.();
      stopDiscovery = undefined;
    }
  };
}

export function useDiscoveredWallets() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
