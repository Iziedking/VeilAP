import { expect, test } from "@playwright/test";

test("gives a first-time player a clear private-agent journey", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("veil-arena:landing-loader-seen", "1"));
  await page.goto("/play");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 4_000 });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Give the guide to a coding agent. Bring back a contender.",
  );
  await expect(page.getByText("NO CODING EXPERIENCE REQUIRED")).toBeVisible();
  await expect(page.getByRole("list", { name: "How to enter" })).toContainText(
    "Copy AGENT.md into your coding agent",
  );
  await expect(page.getByRole("heading", { name: "Choose your arena" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bring your agent package" })).toBeVisible();
  await expect(page.getByRole("link", { name: /download guide/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /copy agent\.md link/i })).toBeEnabled();
  await expect(page.locator('.play-file-button input[type="file"]')).toBeEnabled();
  await expect(page.getByPlaceholder("Paste the complete .veil-agent.json package here")).toBeEnabled();
  await expect(page.getByText("PUBLIC", { exact: true })).toBeVisible();
  await expect(page.getByText("PRIVATE", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wallet access" })).toBeVisible();
  await expect(page.getByRole("button", { name: /no open arena available|import a valid agent package|this arena is not accepting entries/i })).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(/sample agent|preview data|synthetic project/i);
  await page.screenshot({
    path: testInfo.outputPath(`play-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("keeps agent entry usable at 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play");

  const layout = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    h1Count: document.querySelectorAll("h1").length,
    visibleControls: [...document.querySelectorAll("a, button")]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
  }));

  expect(layout.scroll).toBeLessThanOrEqual(layout.client);
  expect(layout.h1Count).toBe(1);
  for (const control of layout.visibleControls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
});
