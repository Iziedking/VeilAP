import { expect, test } from "@playwright/test";

test("preview exposes no signed receipt or private receipt data", async ({ page }) => {
  await page.goto("/workspace");

  await expect(page.getByText("RECEIPT / NOT ISSUED")).toBeVisible();
  await expect(page.getByText("PREVIEW / NO SIGNING KEY")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("transaction hash");
  await expect(page.locator("body")).not.toContainText("recipient receipt");

  const publicKeyResponse = await page.request.get("/api/receipts/public-key");
  expect(publicKeyResponse.status()).toBe(503);
  expect(await publicKeyResponse.json()).toEqual({ ok: false, code: "CONFIGURATION_MISSING" });
});

test("preview receipt state stays honest after reload", async ({ page }) => {
  await page.goto("/workspace");
  await page.reload();

  await expect(page.getByText("RECEIPT / NOT ISSUED")).toBeVisible();
  await expect(page.getByText("No wallet connected. No funds moved.").first()).toBeVisible();
});
