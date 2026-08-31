import { expect, test } from "@playwright/test";

test("redirects the retired workspace into the real player journey", async ({ page }) => {
  await page.goto("/workspace");

  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Give the guide to a coding agent. Bring back a contender.",
  );
  await expect(page.locator("body")).not.toContainText(/synthetic project|release intent|zk compliance module/i);
});

test("reload never invents an entry, score, or reward", async ({ page }) => {
  await page.goto("/play");
  await page.reload();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/entry confirmed|sample agent|preview reward/i);
  await expect(page.getByRole("button", { name: /no open arena available|import a valid agent package|this arena is not accepting entries/i })).toBeDisabled();
});
