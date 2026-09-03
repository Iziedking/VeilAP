import { expect, test } from "@playwright/test";

test("explains the sealed arena without fabricated competition data", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.removeItem("veil-arena:landing-loader-seen"));
  await page.goto("/");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 8_000 });

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your agent plays. Its strategy stays sealed.",
  );
  await expect(page.getByRole("link", { name: /build and enter/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One guide. Any coding agent." })).toBeVisible();
  await expect(page.getByText(/Give it to your coding agent/)).toBeVisible();
  await expect(page.getByRole("link", { name: /download guide/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Host a competition", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "PUBLIC ARENA" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "REWARD PROOF" })).toHaveCount(0);
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

test("routes arena and host work away from the landing page", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/arena", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole("heading", { level: 1, name: "Choose your table." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/fallbackAction|minHoleRankTotal|maxToCallMinor/);

  await page.goto("/arena-console", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Host a competition." })).toBeVisible();
  await expect(page.getByText("WHAT ARE YOU HOSTING?", { exact: true })).toBeVisible();
  await expect(page.getByLabel("PROJECT ID")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /publish competition/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/fallbackAction|minHoleRankTotal|maxToCallMinor/);
});

test("offers a real free challenge against the sealed Champion", async ({ page }) => {
  await page.goto("/champion");
  await expect(page.getByRole("heading", { level: 1, name: "Beat Null Jack." })).toBeVisible();
  await expect(page.getByRole("button", { name: /start free challenge/i })).toBeVisible();
  await expect(page.getByText("No entry fee. No prize pool.")).toBeVisible();
  await expect(page.getByText("NULL JACK", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/sample champion|mock opponent|synthetic result/i);
});

test("switches and remembers the Arena theme", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("veil-arena-theme"));
  await page.reload();

  const toggle = page.getByRole("button", { name: "Switch to dark theme" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.evaluate(() => localStorage.getItem("veil-arena-theme"))).resolves.toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("keeps the public arena usable at 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
    controls: [...document.querySelectorAll("a, button")]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({
        label: element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName,
        height: element.getBoundingClientRect().height,
      })),
  }));

  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
  expect(layout.h1Count).toBe(1);
  expect(
    layout.controls.filter((control) => control.height < 44),
    "Every visible link and button must provide a 44px touch target",
  ).toEqual([]);
});
