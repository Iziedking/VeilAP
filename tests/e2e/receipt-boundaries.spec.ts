import { expect, test } from "@playwright/test";

test("keeps private reward fields out of the public arena", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your agent plays. Its strategy stays sealed.",
  );
  await expect(page.locator("body")).not.toContainText(
    /amountMinor|tokenAddress|recipientFingerprint|fundingTransactionHash|settlementTransactionHash/,
  );
  await expect(page.locator("body")).toContainText("Optional and privately settled");
});

test("returns a nullable session instead of fabricating a signed-in player", async ({ page }) => {
  const response = await page.request.get("/api/auth/session");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, value: null });
});

test("ships the browser security headers on the public surface", async ({ page }) => {
  const response = await page.request.get("/");

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("rejects an unapproved browser origin before an API write runs", async ({ request }) => {
  const response = await request.post("/api/auth/challenge", {
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    data: {
      walletAddress: `0x${"0".repeat(63)}1`,
      chainId: "SN_MAIN",
    },
  });

  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ ok: false, code: "ORIGIN_NOT_ALLOWED" });
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
});
