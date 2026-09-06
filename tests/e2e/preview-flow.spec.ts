import { expect, test } from "@playwright/test";

const savedAgentPackage = {
  protocolVersion: "veil-agent.v1",
  engineVersion: "holdem-sealed-v0.3",
  agentId: "BROWSER_BOT",
  displayName: "Browser Bot",
  policy: { rules: [{ when: { minHandStrength: 4 }, action: "raise" }], fallbackAction: "fold" },
};

test("gives a first-time player a clear private-agent journey", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("veil-arena:landing-loader-seen", "1"));
  await page.goto("/play");
  await expect(page.getByLabel("Veil Arena is loading")).toBeHidden({ timeout: 4_000 });

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Prepare an agent for competition.",
  );
  await expect(page.getByText("AGENT ENTRY", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "How to enter" })).toContainText(
    "Give AGENT.md to a coding agent",
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

test("automatically selects the most recently saved agent for a returning player", async ({ page }) => {
  const season = {
    id: "season-1",
    projectId: "project-1",
    name: "Open exhibition",
    rulesetVersion: "holdem-sealed-v0.3",
    startsAt: "2026-09-01T00:00:00.000Z",
    locksAt: "2099-09-01T00:00:00.000Z",
    endsAt: "2099-09-02T00:00:00.000Z",
    status: "open",
    entryMode: "open",
    maxEntries: 8,
    entryCount: 1,
    rules: {
      resubmissionPolicy: "replace_until_lock",
      rewardPolicy: "optional",
      pairingMode: "round_robin",
      handsPerMatch: 2,
      encountersPerPair: 2,
      revealPolicy: "loser_action_only",
    },
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") {
      return route.fulfill({ json: { ok: true, value: { walletAddress: "0x123", xVerification: { configured: false, identity: null } } } });
    }
    if (path === "/api/profile/agents") {
      return route.fulfill({ json: { ok: true, value: [{ id: "saved-1", agentId: "BROWSER_BOT", displayName: "Browser Bot", engineVersion: "holdem-sealed-v0.3", artifactCommitment: "commitment", version: 1 }] } });
    }
    if (path === "/api/profile/agents/BROWSER_BOT") {
      return route.fulfill({ json: { ok: true, value: { agentPackage: savedAgentPackage } } });
    }
    if (path === "/api/projects/project-1/seasons") {
      return route.fulfill({ json: { ok: true, value: [season] } });
    }
    if (path === "/api/projects/project-1/seasons/season-1/join") {
      return route.fulfill({ json: { ok: true, value: null } });
    }
    return route.fulfill({ json: { ok: true, value: null } });
  });

  await page.goto("/play?project=project-1&season=season-1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose where your agent competes.");
  await expect(page.getByText("READY TO ENTER", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser Bot is selected from your private library.", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Paste the complete .veil-agent.json package here")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "APPROVE, SEAL AND ENTER", exact: true })).toBeEnabled();
});
