import { expect, test } from "@playwright/test";

import { installFakeWallet } from "../fixtures/wallet";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "SESSION_MISSING" }),
    });
  });
});

async function stubPreviewAuth(page: Parameters<typeof installFakeWallet>[0]): Promise<void> {
  await page.route("**/api/auth/challenge", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        challenge: {
          version: 1,
          origin: "http://127.0.0.1:3010",
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
  await expect(page.getByText("You proved control of this wallet. No payment permission was requested.")).toBeVisible();
});

test("refuses an unsupported wallet before sign-in", async ({ page }) => {
  await installFakeWallet(page, "unsupported");
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("This wallet needs STRK20 Wallet API 0.10.3 or newer.")).toBeVisible();
  await expect(page.getByText("SESSION VERIFIED")).toHaveCount(0);
});

test("stops before signing when the Starknet account is not activated", async ({ page }) => {
  await installFakeWallet(page);
  let verifyCalled = false;
  await page.route("**/api/auth/challenge", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "WALLET_ACCOUNT_NOT_DEPLOYED" }),
    });
  });
  await page.route("**/api/auth/verify", async (route) => {
    verifyCalled = true;
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText(
    "This Starknet account is not active yet. Make its first outgoing Starknet transaction in Xverse, then try again.",
  )).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Xverse activation steps" })).toHaveAttribute(
    "href",
    "https://support.xverse.app/hc/en-us/articles/37797696568077-How-to-Activate-Your-Starknet-Account-in-Xverse",
  );
  expect(verifyCalled).toBe(false);
});

test("shows a recoverable message when a wallet rejects connection", async ({ page }) => {
  await installFakeWallet(page, "reject-connect");
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("We could not verify this wallet session. No payment or transfer was approved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another wallet" })).toBeVisible();
});

test("shows a recoverable message when a wallet rejects signing", async ({ page }) => {
  await installFakeWallet(page, "reject-signature");
  await stubPreviewAuth(page);
  await page.goto("/sign-in");

  await page.getByRole("button", { name: "Veil Arena test wallet" }).click();
  await expect(page.getByText("We could not verify this wallet session. No payment or transfer was approved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another wallet" })).toBeVisible();
});
