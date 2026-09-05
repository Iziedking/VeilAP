import { expect, test } from "@playwright/test";

const projectId = "browser-optional-project";
const seasonId = "optional-season";
const packageJson = {
  protocolVersion: "veil-agent.v1",
  engineVersion: "holdem-sealed-v0.3",
  agentId: "OPTIONAL_BOT",
  displayName: "Optional Bot",
  policy: { rules: [{ when: { minHandStrength: 4 }, action: "raise" }], fallbackAction: "fold" },
};

test("optional-reward entry stays testable without X verification", async ({ page }) => {
  const now = new Date();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") {
      return route.fulfill({ json: { ok: true, value: { walletAddress: "0x123", xVerification: { configured: false, identity: null } } } });
    }
    if (path.endsWith(`/projects/${projectId}/seasons`)) {
      return route.fulfill({ json: { ok: true, value: [{
        id: seasonId, projectId, name: "Judge Playground", rulesetVersion: "holdem-sealed-v0.3",
        startsAt: new Date(now.getTime() - 60_000).toISOString(), locksAt: new Date(now.getTime() + 3_600_000).toISOString(), endsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        status: "open", entryMode: "open", maxEntries: 8, entryCount: 0, prizeStatus: "unknown",
        rules: { resubmissionPolicy: "replace_until_lock", rewardPolicy: "optional", pairingMode: "round_robin", handsPerMatch: 8, encountersPerPair: 1, revealPolicy: "loser_action_only" },
      }] } });
    }
    if (path === "/api/profile/agents") return route.fulfill({ json: { ok: true, value: [] } });
    if (path.endsWith(`/projects/${projectId}/seasons/${seasonId}/join`)) {
      if (request.method() === "GET") return route.fulfill({ json: { ok: true, value: null } });
      return route.fulfill({ json: { ok: true, value: {
        id: "entry-optional", seasonId, agentId: "OPTIONAL_BOT", displayName: "Optional Bot", artifactCommitment: "commitment", version: 1, joinedAt: now.toISOString(),
        versions: [{ version: 1, agentId: "OPTIONAL_BOT", displayName: "Optional Bot", artifactCommitment: "commitment", status: "active", submittedAt: now.toISOString() }],
      } } });
    }
    return route.fulfill({ json: { ok: true, value: null } });
  });

  await page.goto(`/play?project=${projectId}&season=${seasonId}`);
  await expect(page.getByText("X ACCOUNT OPTIONAL FOR THIS MODE")).toBeVisible();
  await page.getByPlaceholder("Paste the complete .veil-agent.json package here").fill(JSON.stringify(packageJson));
  const submit = page.getByRole("button", { name: "APPROVE, SEAL AND ENTER" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Optional Bot is sealed.")).toBeVisible();
});

test("profile-save configuration failures keep the reviewed package available", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { ok: true, value: { walletAddress: "0x123", xVerification: { configured: false, identity: null } } } });
    if (path.endsWith(`/projects/${projectId}/seasons`)) return route.fulfill({ json: { ok: true, value: [] } });
    if (path === "/api/profile/agents" && request.method() === "GET") return route.fulfill({ json: { ok: true, value: [] } });
    if (path === "/api/profile/agents" && request.method() === "POST") return route.fulfill({ status: 503, json: { ok: false, code: "CONFIGURATION_MISSING" } });
    return route.fulfill({ json: { ok: true, value: null } });
  });

  await page.goto(`/play?project=${projectId}`);
  await page.getByPlaceholder("Paste the complete .veil-agent.json package here").fill(JSON.stringify(packageJson));
  await page.getByRole("button", { name: "SAVE AGENT TO PROFILE" }).click();
  await expect(page.getByText(/Private agent storage is not configured/)).toBeVisible();
  await expect(page.getByPlaceholder("Paste the complete .veil-agent.json package here")).toHaveValue(JSON.stringify(packageJson));
});
