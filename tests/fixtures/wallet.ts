import type { Page } from "@playwright/test";

export const fakeWalletAddress = `0x${"0".repeat(63)}1`;

export type FakeWalletMode = "compatible" | "unsupported" | "reject-connect" | "reject-signature";

export async function installFakeWallet(page: Page, mode: FakeWalletMode = "compatible"): Promise<void> {
  await page.addInitScript(({ walletMode, address }) => {
    const wallet = {
      id: "veilap-playwright-wallet",
      name: "Veil Arena test wallet",
      version: "1.0.0",
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      on() {
        return undefined;
      },
      off() {
        return undefined;
      },
      async request(input: { type: string }): Promise<unknown> {
        if (input.type === "wallet_supportedWalletApi") {
          return walletMode === "unsupported" ? ["0.10.2"] : ["0.10.3"];
        }
        if (input.type === "wallet_requestAccounts") {
          if (walletMode === "reject-connect") throw new Error("USER_REJECTED");
          return [address];
        }
        if (input.type === "wallet_requestChainId") return "0x534e5f4d41494e";
        if (input.type === "wallet_signTypedData") {
          if (walletMode === "reject-signature") throw new Error("USER_REJECTED");
          return ["0x1", "0x2"];
        }
        throw new Error(`UNSUPPORTED_TEST_WALLET_REQUEST:${input.type}`);
      },
    };
    Object.defineProperty(window, "starknet_veilap_test", {
      configurable: true,
      value: wallet,
    });
  }, { walletMode: mode, address: fakeWalletAddress });
}
