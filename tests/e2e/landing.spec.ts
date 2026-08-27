import { expect, test } from "@playwright/test";

test("keeps the accepted landing promise and wallet entry", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toContainText("Private proof");
  await expect(page.locator("h1")).toContainText("Verifiable delivery");
  await expect(page.locator("h1")).toContainText("Protected payment");
  await expect(
    page.getByRole("banner").getByRole("link", { name: /sign in/i }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("public marketplace");
  await expect(page.locator("body")).not.toContainText(/payroll|supplier|invoice/i);
  await page.screenshot({
    path: testInfo.outputPath(`landing-${testInfo.project.name}.png`),
    fullPage: true,
  });
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
