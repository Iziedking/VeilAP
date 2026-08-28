import { expect, test } from "@playwright/test";

test("reload keeps the synthetic workspace from implying settlement", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Open Circuit package / revision two" }).click();
  await page.getByRole("button", { name: /accept.*prepare/i }).click();

  await expect(page.getByText("The release intent is prepared, not paid.")).toBeVisible();
  await page.getByRole("button", { name: "Close review" }).click();
  await page.reload();

  await expect(page.getByText("Synthetic project and values. No wallet connected. No funds moved.").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/payment complete|confirmed on mainnet/i);
});
