import { expect, test } from "@playwright/test";

const phoneWidths = [320, 360, 375, 390, 412, 430];
const routes = [
  "/",
  "/arena",
  "/champion",
  "/play",
  "/profile",
  "/profile/agents/new",
  "/arena-console",
  "/arena-console/mobile-test/mobile-test",
  "/arena/mobile-test/mobile-test",
  "/arena/mobile-test/mobile-test/match/mobile-test",
  "/sign-in",
];

test.setTimeout(90_000);

test("keeps every public route inside common phone widths", async ({ page }) => {
  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll("a, button, summary")]
          .filter((element) => (element as HTMLElement).offsetParent !== null)
          .map((element) => ({
            label: element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          })),
      }));

      expect(layout.scrollWidth, `${route} overflows at ${width}px`).toBeLessThanOrEqual(layout.clientWidth);
      expect(
        layout.controls.filter((control) => control.width < 44 || control.height < 44),
        `${route} has a small touch target at ${width}px`,
      ).toEqual([]);
    }
  }
});
