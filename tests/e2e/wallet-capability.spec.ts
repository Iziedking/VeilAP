import { expect, test } from "@playwright/test";

import { installFakeWallet } from "../fixtures/wallet";

async function stubPreviewAuth(page: Parameters<typeof installFakeWallet>[0]): Promise<void> {
  await page.route("**/api/auth/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        challenge: {
          version: 1,
          origin: "http://127.0.0.1:3000",
          chainId: "SN_MAIN",
          walletAddress: "0x" + "0".repeat(63) + "1",
          nonce: "playwright-nonce",
          issuedAt: "2026-08-28T10:00:00.000Z",
          expiresAt: "2026-08-28T10:05:00.000Z",
          typedData: { domain: {}, types: {}, primaryType: "VeilArenaSession", message: {} },
        },
      }),
    });
  });
  await page.route("**/api/auth/verify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, walletAddress: "0x" + "0".repeat(63) + "1" }),
    });
  });
  await page.route("**/api/starknet/rpc", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: "0x0" }) });
  });
}

test("connects a compatible test wallet without requesting payment permission", async ({ page }) => {
  await installFakeWallet(page);
  await stubPreviewAuth(page);
  await page.goto("/sign-in");

  await expect(page.getByRole("button", { name: "Veil Arena test wallet" })).toBeVisible();
  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("SESSION VERIFIED")).toBeVisible();
  await expect(page.getByText("Your wallet proved control. No payment permission was requested.")).toBeVisible();
});

test("refuses an unsupported wallet before sign-in", async ({ page }) => {
  await installFakeWallet(page, "unsupported");
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("This wallet needs STRK20 Wallet API 0.10.3 or newer.")).toBeVisible();
  await expect(page.getByText("SESSION VERIFIED")).toHaveCount(0);
});

test("shows a recoverable message when a wallet rejects connection", async ({ page }) => {
  await installFakeWallet(page, "reject-connect");
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("The wallet session could not be verified. Nothing was signed beyond this sign-in request.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another wallet" })).toBeVisible();
});

test("shows a recoverable message when a wallet rejects signing", async ({ page }) => {
  await installFakeWallet(page, "reject-signature");
  await stubPreviewAuth(page);
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("The wallet session could not be verified. Nothing was signed beyond this sign-in request.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another wallet" })).toBeVisible();
});
