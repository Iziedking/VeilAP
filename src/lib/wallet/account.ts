import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { constants, RpcProvider, WalletAccountV6, walletV6 } from "starknet";

import { apiUrl } from "@/lib/api/client";
import { MINIMUM_STRK20_WALLET_API, supportsStrk20 } from "./capability";

export type WalletStandardWallet = WalletWithStarknetFeatures;

export interface WalletConnectionPort<Wallet, Account> {
  supportedWalletApi(wallet: Wallet): Promise<readonly string[]>;
  connect(wallet: Wallet): Promise<Account>;
}

export type WalletConnectionResult<Account> =
  | { kind: "unsupported"; minimum: typeof MINIMUM_STRK20_WALLET_API }
  | { kind: "connected"; account: Account };

export async function connectWithCapability<Wallet, Account>(
  wallet: Wallet,
  port: WalletConnectionPort<Wallet, Account>,
): Promise<WalletConnectionResult<Account>> {
  const versions = await port.supportedWalletApi(wallet);
  if (!supportsStrk20(versions)) {
    return { kind: "unsupported", minimum: MINIMUM_STRK20_WALLET_API };
  }
  return { kind: "connected", account: await port.connect(wallet) };
}

export function createWalletAccountPort(
  rpcUrl: string,
): WalletConnectionPort<WalletWithStarknetFeatures, WalletAccountV6> {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  return {
    // starknet@10.4.0, node_modules/starknet/dist/index.d.ts, read 2026-08-27.
    supportedWalletApi: (wallet) => walletV6.supportedWalletApi(wallet),
    connect: (wallet) => WalletAccountV6.connect(provider, wallet),
  };
}

export type SessionWalletConnection =
  | { kind: "unsupported"; minimum: typeof MINIMUM_STRK20_WALLET_API }
  | { kind: "wrong-network"; required: "SN_MAIN" }
  | { kind: "connected"; account: WalletAccountV6 };

export async function connectSessionWallet(
  wallet: WalletWithStarknetFeatures,
): Promise<SessionWalletConnection> {
  const result = await connectWithCapability(wallet, createWalletAccountPort(apiUrl("/api/starknet/rpc")));
  if (result.kind === "unsupported") return result;
  const chainId = await walletV6.requestChainId(wallet);
  if (chainId !== constants.StarknetChainId.SN_MAIN) {
    result.account.unsubscribeChange();
    return { kind: "wrong-network", required: "SN_MAIN" };
  }
  return result;
}
