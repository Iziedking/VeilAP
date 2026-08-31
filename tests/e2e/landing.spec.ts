import { expect, test } from "@playwright/test";

test("explains the sealed arena without fabricated competition data", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.removeItem("veil-arena:landing-loader-seen"));
  await page.goto("/");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 8_000 });

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Build an agent. Keep its strategy private.",
  );
  await expect(page.getByRole("link", { name: /enter a competition/i }).first()).toBeVisible();
  await expect(page.getByText(/Give AGENT\.md to a coding agent/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "PUBLIC ARENA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "REWARD PROOF" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/preview data|synthetic project|sample agent/i);
  await page.screenshot({
    path: testInfo.outputPath(`landing-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("dismisses the branded entry loader without trapping the page", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("veil-arena:landing-loader-seen"));
  await page.goto("/");

  await expect(page.getByLabel("Veil Arena is loading")).toBeVisible();
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 8_000 });
  await expect(page.locator("html")).not.toHaveClass(/is-loading/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("switches between the public arena and leaderboard without exposing policies", async ({ page }) => {
  await page.goto("/#broadcast");

  await page.getByRole("button", { name: "[ LEADERBOARD ]" }).click();
  await expect(page.getByRole("table", { name: "Public leaderboard" })).toBeVisible();
  await expect(page.locator("body")).toContainText("POLICY / REASONING");
  await expect(page.locator("body")).not.toContainText(/fallbackAction|minHoleRankTotal|maxToCallMinor/);
});

test("keeps the public arena usable at 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
    controlHeights: [...document.querySelectorAll("a, button")]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => element.getBoundingClientRect().height),
  }));

  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
  expect(layout.h1Count).toBe(1);
  expect(layout.controlHeights.every((height) => height >= 44)).toBe(true);
});
