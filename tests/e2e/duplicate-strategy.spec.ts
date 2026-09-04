import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createMemoryRepositories } from "../../src/server/db/repositories";
import { createPreviewKeyProvider } from "../../src/server/crypto/preview-key-provider";
import { ProjectService } from "../../src/server/projects/project-service";
import { ArenaEnrollmentService } from "../../src/server/arena/arena-enrollment-service";
import { ParticipantAgentService } from "../../src/server/arena/participant-agent-service";
import { resolveTournamentRules, tournamentRulesCommitment } from "../../src/domain/arena/tournament-rules";

test("explains duplicate entry refusal without exposing the other account or changing My agents", async ({ page }, info) => {
  const repositories = createMemoryRepositories().projects;
  const now = new Date();
  const deps = { repositories, keyProvider: createPreviewKeyProvider(), walletHashPepper: "browser-duplicate-".repeat(3), now: () => now, idFactory: randomUUID };
  const project = await new ProjectService(deps).createProject({ name: "Browser competition", walletAddress: "0x1" });
  if (!project.ok) throw new Error(project.code);
  const projectId = project.value.id;
  const rules = resolveTournamentRules({ templateId: "playground" });
  const season = { id: "browser-season", projectId, name: "Exact strategy competition", rulesetVersion: rules.engineVersion,
    startsAt: new Date(now.getTime() - 3600000), locksAt: new Date(now.getTime() + 3600000), endsAt: new Date(now.getTime() + 7200000),
    status: "open" as const, entryMode: "open" as const, maxEntries: 8, rulesSnapshot: rules, rulesCommitment: tournamentRulesCommitment(rules), createdBy: "test", createdAt: now };
  await repositories.saveArenaSeason(season);
  const enrollment = new ArenaEnrollmentService(deps);
  const pkg = { protocolVersion: "veil-agent.v1", engineVersion: rules.engineVersion, agentId: "MY_COPY", displayName: "My Copy", policy: { rules: [{ when: { pocketPair: true }, action: "raise" }], fallbackAction: "fold" } };
  const first = await enrollment.enroll({ projectId, seasonId: season.id, actorWalletAddress: "0x2", agentId: "PRIVATE_OTHER", policy: { ...pkg, agentId: "PRIVATE_OTHER", displayName: "Private Other" }, idempotencyKey: "browser-original" });
  expect(first.ok).toBe(true);
  const vault = new ParticipantAgentService({ ...deps, sessionSecret: "s".repeat(64), vaultKeys: { currentKeyId: "test", keys: { test: "ab".repeat(32) } } });
  const saved = await vault.save({ actorWalletAddress: "0x3", agentPackage: pkg });
  const responses: string[] = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let result: unknown = { ok: true, value: null };
    if (path === "/api/auth/session") result = { ok: true, value: { walletAddress: "0x3", xVerification: { configured: true, identity: { username: "test_player", profileImageUrl: null, connectedAt: now.toISOString(), lastVerifiedAt: now.toISOString() } } } };
    else if (path === "/api/competitions") result = { ok: true, value: [{ projectId }] };
    else if (path.endsWith("/seasons")) result = { ok: true, value: [{ ...season, startsAt: season.startsAt.toISOString(), locksAt: season.locksAt.toISOString(), endsAt: season.endsAt.toISOString(), rules, entryCount: 1 }] };
    else if (path.endsWith("/join")) {
      result = req.method() === "POST"
        ? await enrollment.enroll({ ...req.postDataJSON(), projectId, seasonId: season.id, actorWalletAddress: "0x3", idempotencyKey: req.headers()["idempotency-key"] })
        : await enrollment.getMyEntry({ projectId, seasonId: season.id, actorWalletAddress: "0x3" });
    } else if (path === "/api/profile/agents") result = { ok: true, value: await vault.list("0x3") };
    else if (path.endsWith("/agents/MY_COPY")) result = { ok: true, value: await vault.open({ actorWalletAddress: "0x3", agentId: "MY_COPY" }) };
    const json = JSON.stringify(result); responses.push(json);
    return route.fulfill({ status: (result as { ok: boolean }).ok ? 200 : 409, contentType: "application/json", body: json });
  });
  await page.goto(`/play?project=${projectId}&season=${season.id}&agent=MY_COPY`);
  await expect(page.getByText("One entry per exact strategy. Changing its name or ID does not make it a different strategy.")).toBeVisible();
  await page.getByRole("button", { name: /APPROVE, SEAL AND ENTER/ }).click();
  await expect(page.getByText(/This competition already has an entry with the same strategy/)).toBeVisible();
  await expect(page.getByText(/Your saved agent is unchanged/)).toBeVisible();
  expect(await vault.list("0x3")).toEqual([saved]);
  expect(await repositories.listArenaSeasonEntries(projectId, season.id)).toHaveLength(1);
  const privateEntry = await repositories.getArenaSeasonEntry(projectId, season.id, "PRIVATE_OTHER");
  expect(responses.join(" ")).not.toContain(privateEntry!.strategyFingerprint!);
  expect(responses.join(" ")).not.toContain("PRIVATE_OTHER");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("duplicate-entry-refused.png"), fullPage: true });
});
