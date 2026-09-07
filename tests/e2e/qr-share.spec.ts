import { expect, test } from "@playwright/test";

test("shows a scannable QR code beside the private competition link", async ({ page }) => {
  const projectId = "qr-project";
  const seasonId = "qr-season";
  const season = {
    id: seasonId,
    projectId,
    name: "QR share duel",
    rulesetVersion: "holdem-sealed-v0.3",
    startsAt: "2026-09-06T00:00:00.000Z",
    locksAt: "2026-09-07T00:00:00.000Z",
    endsAt: "2026-09-08T00:00:00.000Z",
    status: "open",
    entryMode: "invite_only",
    maxEntries: 2,
    entryCount: 0,
    createdAt: "2026-09-06T00:00:00.000Z",
    rules: { rewardPolicy: "optional" },
  };
  const inviteUrl = `http://localhost:3010/play?project=${projectId}&season=${seasonId}&invite=qr-test-token`;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let result: unknown = { ok: true, value: null };
    if (path === `/api/projects/${projectId}/seasons`) result = { ok: true, value: [season] };
    else if (path === `/api/projects/${projectId}/strategies`) result = { ok: true, value: [] };
    else if (path === `/api/projects/${projectId}/seasons/${seasonId}`) result = { ok: true, value: { season, entries: [], matches: [] } };
    else if (path === `/api/projects/${projectId}/seasons/${seasonId}/prize-pool`) {
      status = 404;
      result = { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
    } else if (path === `/api/projects/${projectId}/seasons/${seasonId}/invitation`) {
      result = { ok: true, value: { url: inviteUrl, expiresAt: "2026-09-06T01:00:00.000Z" } };
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
  });

  await page.goto(`/arena-console/${projectId}/${seasonId}`);
  await expect(page.getByText("SHARE THE COMPETITION", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reward and payout" })).toHaveCount(0);
  await page.getByRole("button", { name: "CREATE JOIN LINK" }).click();

  const qr = page.getByRole("img", { name: "QR code for the competition join link" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.getByRole("button", { name: "COPY LINK" })).toBeVisible();
  await expect(page.getByLabel("Competition join link")).toHaveValue(inviteUrl);
  await expect(page.getByRole("link", { name: /^JOIN/ })).toHaveAttribute("href", inviteUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
