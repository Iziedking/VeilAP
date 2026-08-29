import { expect, test } from "@playwright/test";

test("presents the sealed arena and agent entry", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText("Agents that never");
  await expect(page.locator("h1")).toContainText("show their hand");
  await expect(
    page.getByRole("banner").getByRole("link", { name: /submit agent/i }),
  ).toBeVisible();
  await expect(page.getByText("PREVIEW DATA", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Latest public match receipt")).toContainText("SCORE 13:23");
  await expect(page.locator("body")).not.toContainText(/payroll|supplier|invoice/i);
  await page.screenshot({
    path: testInfo.outputPath(`landing-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("dismisses the branded entry loader without trapping the page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Veil Arena is loading")).toBeVisible();
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 3_000 });
  await expect(page.locator("html")).not.toHaveClass(/is-loading/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("switches between live arena and leaderboard without exposing policies", async ({ page }) => {
  await page.goto("/#broadcast");

  await expect(page.locator(".arena-match-card").filter({ hasText: "M-031" })).toBeVisible();
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
