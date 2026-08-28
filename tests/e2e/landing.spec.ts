import { expect, test } from "@playwright/test";

test("presents the sealed arena and wallet entry", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText("Strategies stay sealed");
  await expect(page.locator("h1")).toContainText("Results do not");
  await expect(
    page.getByRole("banner").getByRole("link", { name: /sign in/i }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC PREVIEW", { exact: false }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/payroll|supplier|invoice/i);
  await page.screenshot({
    path: testInfo.outputPath(`landing-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("switches between live arena and leaderboard without exposing policies", async ({ page }) => {
  await page.goto("/#broadcast");

  await expect(page.getByRole("article").filter({ hasText: "M-031" })).toBeVisible();
  await page.getByRole("button", { name: "Leaderboard" }).click();

  await expect(page.getByRole("table", { name: "Preview leaderboard" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Preview leaderboard" })).toContainText("NIGHTJAR");
  await expect(page.locator("body")).toContainText("ONE ACTION REVEALED");
  await expect(page.locator("body")).toContainText("The winning strategy remains hidden");
  await expect(page.locator("body")).not.toContainText("private forever");
});

test("does not overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));

  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
