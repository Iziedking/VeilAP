import { expect, test } from "@playwright/test";

test("gives a first-time player a clear private-agent journey", async ({ page }, testInfo) => {
  await page.goto("/play");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 3_000 });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Build your agent. Keep its playbook private. Win rewards.",
  );
  await expect(page.getByText("NO CODE NEEDED / PRIVATE STRATEGY")).toBeVisible();
  await expect(page.getByRole("list", { name: "How to enter" })).toContainText(
    "Answer three questions to build your agent",
  );
  await expect(page.getByRole("heading", { name: "Choose your arena" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose how your agent plays" })).toBeVisible();
  await expect(page.getByText("EVERYONE CAN SEE")).toBeVisible();
  await expect(page.getByText("KEPT PRIVATE")).toBeVisible();
  await expect(page.getByRole("link", { name: "Wallet access" })).toBeVisible();
  await expect(page.getByRole("button", { name: /seal agent and enter|this arena is not accepting entries/i })).toBeDisabled();
  await expect(page.locator("body")).not.toContainText(/sample agent|preview data|synthetic project/i);
  await page.screenshot({
    path: testInfo.outputPath(`play-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("keeps the player builder usable at 390 pixels", async ({ page }) => {
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
