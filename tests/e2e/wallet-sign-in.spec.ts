import { expect, test } from "@playwright/test";

test("wallet sign-in keeps the security boundary visible", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sign in without handing over your keys.",
  );
  await expect(page.getByText("No Starknet wallet found")).toBeVisible();
  await expect(page.getByText(/Signing proves control only/)).toBeVisible();
  await expect(page.getByText(/never ask for a private key or viewing key/)).toBeVisible();

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
});
