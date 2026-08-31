import { RpcError, type RpcProvider } from "starknet";

export type WalletAccountReadiness =
  | { ok: true }
  | { ok: false; code: "WALLET_ACCOUNT_NOT_DEPLOYED" | "RPC_UNAVAILABLE" };

type AccountClassProvider = Pick<RpcProvider, "getClassHashAt">;

export async function checkWalletAccountReadiness(
  provider: AccountClassProvider,
  walletAddress: string,
): Promise<WalletAccountReadiness> {
  try {
    await provider.getClassHashAt(walletAddress);
    return { ok: true };
  } catch (error) {
    if (error instanceof RpcError && error.isType("CONTRACT_NOT_FOUND")) {
      return { ok: false, code: "WALLET_ACCOUNT_NOT_DEPLOYED" };
    }
    return { ok: false, code: "RPC_UNAVAILABLE" };
  }
}
