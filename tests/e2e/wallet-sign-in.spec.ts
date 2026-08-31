import { expect, test } from "@playwright/test";

test("wallet sign-in keeps the security boundary visible", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/sign-in");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 4_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sign in with your wallet.",
  );
  await expect(page.getByText("Checking your session...")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("No Starknet wallet found")).toBeVisible();
  await expect(page.getByText(/This signature proves control and cannot move funds/)).toBeVisible();
  await expect(page.getByText(/will not ask for either/i)).toBeVisible();

  const layout = await page.evaluate(() => ({
    h1Count: document.querySelectorAll("h1").length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    controlHeights: [...document.querySelectorAll("a, button")].map(
      (element) => element.getBoundingClientRect().height,
    ),
  }));
  expect(layout.h1Count).toBe(1);
  expect(layout.overflow).toBe(false);
  expect(layout.controlHeights.every((height) => height >= 44)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`wallet-sign-in-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
