import { expect, test, type Page } from "@playwright/test";
import { runMatch } from "../../src/domain/arena/poker-engine";
import { compileAgentPackage, parseAgentPackage } from "../../src/domain/arena/strategy-policy";

const player = (agentId: string, action: "raise" | "call") => compileAgentPackage(parseAgentPackage({
  protocolVersion: "veil-agent.v1", engineVersion: "holdem-sealed-v0.3", agentId, displayName: agentId,
  policy: { rules: [{ when: { minHoleRankTotal: 4 }, action }], fallbackAction: "fold" },
}));
const result = runMatch({ agents: [player("LEFT", "raise"), player("RIGHT", "call")], hands: 2, seed: "audit-seed", matchId: "audit-receipt" });
if (!result.ok) throw new Error(result.code);
const played = result.value;
const date = "2026-09-04T00:00:00.000Z";
const schedule = {
  season: {
    id: "audit-season", projectId: "audit-project", name: "Audit competition", status: "locked",
    startsAt: date, locksAt: date, endsAt: date, entryMode: "open", maxEntries: 2,
    entryCount: 2, matchCount: 1, completedMatchCount: 1, runningMatchCount: 0,
  },
  entries: ["LEFT", "RIGHT"].map((agentId) => ({ agentId, displayName: agentId, artifactCommitment: agentId })),
  matches: [{ id: "audit-match", matchId: "audit-receipt", seasonId: "audit-season", sequence: 1, hands: 2,
    leftAgentId: "LEFT", rightAgentId: "RIGHT", status: "completed", createdAt: date, startsAt: date }],
};
const receipt = {
  ...played.publicReceipt, handCount: 2, publicHandReceipts: played.publicHandReceipts, createdAt: date,
  players: ["LEFT", "RIGHT"].map((agentId) => ({ agentId, displayName: agentId, artifactCommitment: agentId })),
};
const url = "/arena/audit-project/audit-season/match/audit-match";

async function fixtures(page: Page, scheduleFailure?: () => boolean) {
  // Only test-browser responses are intercepted. These are not production records.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/projects/audit-project/seasons/audit-season") {
      if (scheduleFailure?.()) return route.fulfill({ status: 503, json: { ok: false, code: "TEMPORARY_OUTAGE" } });
      return route.fulfill({ json: { ok: true, value: schedule } });
    }
    if (path === "/api/projects/audit-project/matches/audit-receipt") {
      return route.fulfill({ json: { ok: true, value: receipt } });
    }
    return route.fulfill({ json: { ok: true, value: null } });
  });
}

test("replay scoreboard equals the engine score after the final hand", async ({ page }) => {
  await fixtures(page);
  await page.goto(url);
  await page.getByRole("button", { name: `Open receipt ${played.publicHandReceipts.length}`, exact: true }).click();
  await expect(page.locator(".spectator-seat.is-left .spectator-seat-score")).toHaveText(String(played.score.LEFT));
  await expect(page.locator(".spectator-seat.is-right .spectator-seat-score")).toHaveText(String(played.score.RIGHT));
});

test("one click on replay at natural completion restarts playback", async ({ page }) => {
  await fixtures(page);
  await page.goto(url);
  const replay = page.getByRole("button", { name: "Replay match", exact: true });
  await expect(replay).toBeVisible({ timeout: 10000 });
  await replay.click();
  await expect(page.getByRole("button", { name: "Pause replay", exact: true })).toBeVisible();
});

test("a transient schedule failure is retried without reloading", async ({ page }) => {
  let attempts = 0;
  await fixtures(page, () => ++attempts === 1);
  await page.goto(url);
  await expect.poll(() => attempts, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".spectator-stage")).toBeVisible();
});


test("historical v0.3 replay uses score deltas at intermediate and final receipts", async ({ page }) => {
  const legacy = runMatch({ agents: [player("LEFT", "raise"), player("RIGHT", "call")], hands: 2, seed: "audit-seed", matchId: "audit-receipt", receiptVersion: 1 });
  if (!legacy.ok) throw new Error(legacy.code);
  await fixtures(page);
  await page.route("**/api/projects/audit-project/matches/audit-receipt", route => route.fulfill({ json: { ok: true, value: { ...receipt, ...legacy.value.publicReceipt, receiptVersion: undefined, publicHandReceipts: legacy.value.publicHandReceipts } } }));
  await page.goto(url);
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page.getByRole("button", { name: "Open receipt 1", exact: true }).click();
  await expect(page.locator(".spectator-seat.is-left .spectator-seat-score")).toHaveText(String(legacy.value.hands[0]!.scoreDelta.LEFT));
  await page.getByRole("button", { name: "Open receipt 4", exact: true }).click();
  await expect(page.locator(".spectator-seat.is-left .spectator-seat-score")).toHaveText(String(legacy.value.score.LEFT));
});

test("pause, seek to end and restart have explicit transitions", async ({ page }) => {
  await fixtures(page); await page.goto(url);
  await page.getByRole("button", { name: "Pause replay", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play replay", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open receipt 4", exact: true }).click();
  await page.getByRole("button", { name: "Replay match", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause replay", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open receipt 1", exact: true })).toHaveClass(/is-active/);
});

for (const initialStatus of ["scheduled", "running"] as const) test(`recovers after interruption while ${initialStatus}`, async ({ page }) => {
  let requests = 0;
  await fixtures(page);
  await page.route("**/api/projects/audit-project/seasons/audit-season", route => {
    requests++;
    if (requests === 2) return route.fulfill({ status: 503, json: { ok: false, code: "TEMPORARY_OUTAGE" } });
    const status = requests >= 3 ? "completed" : initialStatus;
    return route.fulfill({ json: { ok: true, value: { ...schedule, matches: [{ ...schedule.matches[0], status, matchId: status === "completed" ? "audit-receipt" : undefined }] } } });
  });
  await page.goto(url);
  await expect(page.locator(".spectator-stage")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Reconnecting", { timeout: 8000 });
  await expect.poll(() => requests, { timeout: 8000 }).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("button", { name: "Open receipt 4", exact: true })).toBeVisible();
  await expect(page.getByText("LIVE TABLE", { exact: true })).toHaveCount(0);
});

test("navigation to another match starts its replay at the first receipt", async ({ page }) => {
  await fixtures(page);
  const second = { ...receipt, matchId: "audit-receipt-2" };
  await page.route("**/api/projects/audit-project/seasons/audit-season", route => route.fulfill({ json: { ok: true, value: { ...schedule, matches: [...schedule.matches, { ...schedule.matches[0], id: "audit-match-2", matchId: "audit-receipt-2", sequence: 2 }] } } }));
  await page.route("**/api/projects/audit-project/matches", route => route.fulfill({ json: { ok: true, value: { matches: [receipt, second], leaderboard: [] } } }));
  await page.route("**/api/projects/audit-project/matches/audit-receipt-2", route => route.fulfill({ json: { ok: true, value: second } }));
  await page.goto(url);
  await page.getByRole("button", { name: "Open receipt 4", exact: true }).click();
  await page.getByRole("link", { name: "← Audit competition", exact: true }).click();
  await page.locator('.room-match[href$="/match/audit-match-2"]').click();
  await expect(page.getByRole("button", { name: "Pause replay", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open receipt 1", exact: true })).toHaveClass(/is-active/);
});

test("returning after logout clears the completed private replay", async ({ page }) => {
  let loggedOut = false;
  await fixtures(page);
  await page.route("**/api/projects/audit-project/seasons/audit-season/join", route => route.fulfill({ json: { ok: true, value: loggedOut ? null : { agentId: "LEFT", displayName: "LEFT", artifactCommitment: "LEFT", version: 1 } } }));
  await page.route("**/api/auth/session", route => route.fulfill({ json: { ok: true, value: loggedOut ? null : { xVerification: { identity: { username: "audit-owner" } } } } }));
  await page.route("**/api/projects/audit-project/seasons/audit-season/matches/audit-match/private", route => route.fulfill(loggedOut ? { status: 401, json: { ok: false } } : { json: { ok: true, value: { matchId: "audit-receipt", agentId: "LEFT", displayName: "LEFT", handCount: 2, hands: played.publicHandReceipts.map(hand => ({ ...hand, board: [], holeCards: [{ rank: 14, suit: "spades" }, { rank: 13, suit: "hearts" }], action: "raise", position: "button" })) } } }));
  await page.goto(url);
  await expect(page.getByLabel("A♠", { exact: true })).toBeVisible();
  loggedOut = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("A♠", { exact: true })).toHaveCount(0);
  await expect(page.getByText("@audit-owner", { exact: true })).toHaveCount(0);
  await expect(page.locator(".spectator-stage")).toBeVisible();
});
