import { expect, test } from "@playwright/test";

test("refuses tampered evidence and prepares only a preview release", async ({ page }, testInfo) => {
  await page.goto("/workspace");

  await expect(page.getByRole("heading", { name: "ZK Compliance Module" })).toBeVisible();
  await expect(page.getByText("Synthetic project and values. No wallet connected. No funds moved.").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/payroll|supplier|invoice/i);

  await page.getByRole("button", { name: "Open Circuit package / revision one" }).click();
  await expect(page.getByRole("dialog")).toContainText("The artifact changed after its checkpoint was recorded.");
  await expect(page.getByRole("dialog")).toContainText("MISMATCH");
  await expect(page.getByRole("button", { name: /accept.*prepare/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Close review" }).click();

  await page.getByRole("button", { name: "Open Circuit package / revision two" }).click();
  await expect(page.getByRole("dialog")).toContainText("Accept the exact checkpoint");
  await page.getByRole("button", { name: /accept.*prepare/i }).click();

  await expect(page.getByRole("dialog")).toContainText("The milestone release is prepared, not paid.");
  await expect(page.getByRole("dialog")).toContainText("Synthetic project and values. No wallet connected. No funds moved.");
  await expect(page.getByText("RELEASE INTENT / PREPARED")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/transaction hash|payment complete/i);
  await page.getByRole("button", { name: "Close review" }).click();
  await page.screenshot({
    path: testInfo.outputPath(`workspace-prepared-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("keeps the proof workspace within a 390px viewport with usable controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace");

  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);

  const checkpointControls = page.locator(".checkpoint-open");
  await expect(checkpointControls).toHaveCount(2);
  const sizes = await checkpointControls.evaluateAll((controls) =>
    controls.map((control) => {
      const rect = control.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
});
