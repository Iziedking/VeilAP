import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";

import { ArenaSeasonService } from "./arena-season-service";
import { StrategyService } from "./strategy-service";
import { ArenaMatchService } from "./arena-match-service";
import { createReceiptSigner } from "@/server/receipts/signing";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const policy = (displayName: string, fallbackAction: "fold" | "check" | "raise") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action: fallbackAction }],
  fallbackAction,
});

async function setup() {
  const repositories = createMemoryRepositories();
  const keyProvider = createPreviewKeyProvider();
  let nextId = 0;
  const dependencies = {
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-30T00:00:00.000Z"),
    idFactory: () => `id-${++nextId}`,
  };
  const projects = new ProjectService(dependencies);
  const project = await projects.createProject({ name: "Arena scheduling", walletAddress: company });
  if (!project.ok) throw new Error(project.code);
  await projects.inviteMember({
    projectId: project.value.id,
    actorWalletAddress: company,
    walletAddress: contributor,
    role: "contributor",
  });
  const strategies = new StrategyService(dependencies);
  for (const [agentId, displayName, action] of [["CINDER", "Cinder", "check"], ["EMBER", "Ember", "raise"], ["NOVA", "Nova", "fold"]] as const) {
    const result = await strategies.submitStrategy({
      projectId: project.value.id,
      actorWalletAddress: contributor,
      agentId,
      policy: policy(displayName, action),
    });
    if (!result.ok) throw new Error(result.code);
  }
  const pair = generateKeyPairSync("ed25519");
  const matchService = new ArenaMatchService({
    ...dependencies,
    signer: createReceiptSigner({
      privateKeyBase64: pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      publicKeyBase64: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    }),
    seedFactory: () => "scheduled-match-seed",
  });
  return {
    repositories,
    projectId: project.value.id,
    service: new ArenaSeasonService({ ...dependencies, matchService }),
  };
}

const seasonInput = {
  name: "Preview Season 01",
  rulesetVersion: "holdem.v1",
  startsAt: "2026-09-01T00:00:00.000Z",
  locksAt: "2026-09-02T00:00:00.000Z",
  endsAt: "2026-09-04T00:00:00.000Z",
};

describe("ArenaSeasonService", () => {
  it("snapshots sealed artifacts and creates a deterministic round-robin schedule", async () => {
    const { projectId, service } = await setup();
    const created = await service.createSeason({
      projectId,
      actorWalletAddress: company,
      idempotencyKey: "season-create-1",
      templateId: "custom",
      customRules: {
        pairingMode: "round_robin",
        entryMode: "invite_only",
        maxEntries: 3,
        handsPerMatch: 5,
        encountersPerPair: 1,
        resubmissionPolicy: "fixed",
        rewardPolicy: "optional",
      },
      ...seasonInput,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.code);

    for (const [agentId, key] of [["CINDER", "entry-cinder-1"], ["EMBER", "entry-ember-1"], ["NOVA", "entry-nova-1"]] as const) {
      await expect(service.registerEntry({
        projectId,
        seasonId: created.value.id,
        actorWalletAddress: contributor,
        agentId,
        idempotencyKey: key,
      })).resolves.toMatchObject({ ok: true });
    }

    const locked = await service.lockSeason({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: company,
      idempotencyKey: "season-lock-1",
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) throw new Error(locked.code);
    expect(locked.value.season.status).toBe("locked");
    expect(locked.value.entries.map((entry) => entry.agentId)).toEqual(["CINDER", "EMBER", "NOVA"]);
    expect(locked.value.matches.map((match) => [match.sequence, match.leftAgentId, match.rightAgentId, match.hands])).toEqual([
      [1, "CINDER", "EMBER", 5],
      [2, "CINDER", "NOVA", 5],
      [3, "EMBER", "NOVA", 5],
    ]);

    await expect(service.lockSeason({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: company,
      idempotencyKey: "season-lock-1",
    })).resolves.toEqual(locked);
    await expect(service.lockSeason({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: company,
      benchmarkAgentId: "CINDER",
      idempotencyKey: "season-lock-1",
    })).resolves.toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("does not lock a season without two real sealed entries", async () => {
    const { projectId, service } = await setup();
    const created = await service.createSeason({
      projectId,
      actorWalletAddress: company,
      idempotencyKey: "season-create-2",
      templateId: "playground",
      ...seasonInput,
    });
    if (!created.ok) throw new Error(created.code);
    await service.registerEntry({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: contributor,
      agentId: "CINDER",
      idempotencyKey: "entry-cinder-2",
    });
    await expect(service.lockSeason({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: company,
      idempotencyKey: "season-lock-2",
    })).resolves.toEqual({ ok: false, code: "ARENA_SEASON_TOO_SMALL" });
  });

  it("claims, executes, and safely retries a scheduled pairing", async () => {
    const { repositories, projectId, service } = await setup();
    const created = await service.createSeason({
      projectId,
      actorWalletAddress: company,
      idempotencyKey: "season-create-3",
      templateId: "custom",
      customRules: {
        pairingMode: "duel_series",
        entryMode: "invite_only",
        maxEntries: 2,
        handsPerMatch: 2,
        encountersPerPair: 1,
        resubmissionPolicy: "fixed",
        rewardPolicy: "optional",
      },
      ...seasonInput,
    });
    if (!created.ok) throw new Error(created.code);
    for (const [agentId, key] of [["CINDER", "entry-cinder-3"], ["EMBER", "entry-ember-3"]] as const) {
      const entry = await service.registerEntry({
        projectId,
        seasonId: created.value.id,
        actorWalletAddress: contributor,
        agentId,
        idempotencyKey: key,
      });
      if (!entry.ok) throw new Error(entry.code);
    }
    const locked = await service.lockSeason({
      projectId,
      seasonId: created.value.id,
      actorWalletAddress: company,
      idempotencyKey: "season-lock-3",
    });
    if (!locked.ok) throw new Error(locked.code);
    const scheduledMatchId = locked.value.matches[0]?.id;
    if (!scheduledMatchId) throw new Error("TEST_SCHEDULE_MISSING");

    const run = await service.runScheduledMatch({
      projectId,
      seasonId: created.value.id,
      scheduledMatchId,
      actorWalletAddress: company,
      idempotencyKey: "scheduled-run-3",
    });
    expect(run.ok).toBe(true);
    if (!run.ok) throw new Error(run.code);
    expect(run.value.matchId).toBe(locked.value.matches[0]?.matchId);
    const stored = await repositories.projects.getArenaScheduledMatch(projectId, created.value.id, scheduledMatchId);
    expect(stored?.status).toBe("completed");
    expect(stored?.attempts).toBe(1);

    await expect(service.runScheduledMatch({
      projectId,
      seasonId: created.value.id,
      scheduledMatchId,
      actorWalletAddress: company,
      idempotencyKey: "scheduled-run-3",
    })).resolves.toEqual(run);
  });
});
