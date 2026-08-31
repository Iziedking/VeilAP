import { describe, expect, it } from "vitest";

import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";
import { resolveTournamentRules, tournamentRulesCommitment } from "@/domain/arena/tournament-rules";
import { normalizeFeltAddress } from "@/lib/strk20/address";
import { decryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import {
  createMemoryRepositories,
  type ArenaPrizePoolStatus,
  type ArenaSeasonRecord,
} from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

import { ArenaEnrollmentService } from "./arena-enrollment-service";
import { openStrategyArtifact } from "./strategy-artifacts";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const operator = address("1");
const playerOne = address("2");
const playerTwo = address("3");
const playerThree = address("4");
const now = new Date("2026-08-30T12:00:00.000Z");
const policy = (displayName: string, action: "fold" | "check" | "raise") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action }],
  fallbackAction: action,
});
const agentPackage = (agentId: string, displayName: string) => ({
  protocolVersion: "veil-agent.v1" as const,
  engineVersion: ARENA_ENGINE_VERSION,
  agentId,
  displayName,
  policy: {
    rules: [
      { when: { handCategories: ["straight", "flush", "full_house", "four_kind", "straight_flush"] as const }, action: "raise" as const },
      { when: { pocketPair: true }, action: "call" as const },
    ],
    fallbackAction: "fold" as const,
  },
});

async function setup(
  overrides: Partial<ArenaSeasonRecord> = {},
  keyProvider: KeyProvider = createPreviewKeyProvider(),
  prizeStatus: ArenaPrizePoolStatus | "missing" = "funded",
) {
  const repositories = createMemoryRepositories();
  let nextId = 0;
  const dependencies = {
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => now,
    idFactory: () => `id-${++nextId}`,
  };
  const projectResult = await new ProjectService(dependencies).createProject({
    name: "Public arena",
    walletAddress: operator,
  });
  if (!projectResult.ok) throw new Error(projectResult.code);
  const season: ArenaSeasonRecord = {
    id: "season-open-1",
    projectId: projectResult.value.id,
    name: "Open table 01",
    rulesetVersion: "holdem.v1",
    startsAt: new Date("2026-08-30T11:00:00.000Z"),
    locksAt: new Date("2026-08-30T13:00:00.000Z"),
    endsAt: new Date("2026-08-30T15:00:00.000Z"),
    status: "open",
    entryMode: "open",
    maxEntries: 2,
    templateId: "playground",
    templateVersion: 1,
    rulesSnapshot: resolveTournamentRules({ templateId: "playground" }),
    createdBy: "operator-fingerprint",
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
    ...overrides,
  };
  season.rulesCommitment = season.rulesSnapshot ? tournamentRulesCommitment(season.rulesSnapshot) : undefined;
  await repositories.projects.saveArenaSeason(season);
  if (prizeStatus !== "missing") {
    await repositories.projects.saveArenaPrizePool({
      id: "pool-open-1",
      projectId: projectResult.value.id,
      seasonId: season.id,
      tokenAddress: address("10"),
      tokenSymbol: "STRK",
      poolAddress: address("20"),
      amountMinor: "1000000",
      sponsorFingerprint: "sponsor-fingerprint",
      status: prizeStatus,
      fundingTransactionHash: prizeStatus === "funded" ? address("30") : undefined,
      fundingReceiptDigest: prizeStatus === "funded" ? "funding-receipt" : undefined,
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      updatedAt: new Date("2026-08-30T10:30:00.000Z"),
    });
  }
  return {
    repositories,
    keyProvider,
    projectId: projectResult.value.id,
    season,
    service: new ArenaEnrollmentService(dependencies),
  };
}

describe("ArenaEnrollmentService", () => {
  it("atomically seals a public strategy and binds its payout wallet", async () => {
    const { repositories, keyProvider, projectId, season, service } = await setup();
    const result = await service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "ember_01",
      policy: policy("Ember", "raise"),
      idempotencyKey: "join-ember-001",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.value.agentId).toBe("EMBER_01");
    expect(result.value.version).toBe(1);
    expect(result.value.versions).toEqual([expect.objectContaining({ version: 1, status: "active" })]);

    const project = await repositories.projects.getProject(projectId);
    const artifact = await repositories.projects.getArenaStrategyArtifact(projectId, "EMBER_01");
    const entry = await repositories.projects.getArenaSeasonEntry(projectId, season.id, "EMBER_01");
    expect(project).toBeDefined();
    expect(artifact).toBeDefined();
    expect(entry?.encryptedPayoutWallet).toBeDefined();
    if (!project || !artifact || !entry?.encryptedPayoutWallet) throw new Error("TEST_ENROLLMENT_MISSING");
    expect(JSON.stringify(artifact.encryptedPolicy)).not.toContain("raise");

    const dataKey = await keyProvider.unwrap(project.wrappedDataKey, projectId);
    const opened = await openStrategyArtifact({
      record: artifact,
      keyMaterial: { dataKey, wrappedKey: project.wrappedDataKey },
    });
    expect(opened.policy.displayName).toBe("Ember");
    expect(decryptField(
      entry.encryptedPayoutWallet,
      { projectId, recordType: "arena_season_entry", recordId: entry.id, fieldName: "payout_wallet" },
      dataKey,
    )).toBe(normalizeFeltAddress(playerOne));
  });

  it("makes exact retries safe and rejects changed requests under the same key", async () => {
    const previewProvider = createPreviewKeyProvider();
    let unwrapCount = 0;
    const keyProvider: KeyProvider = {
      wrap: (dataKey, projectId) => previewProvider.wrap(dataKey, projectId),
      async unwrap(wrappedKey, projectId) {
        unwrapCount += 1;
        return previewProvider.unwrap(wrappedKey, projectId);
      },
    };
    const { projectId, season, service } = await setup({}, keyProvider);
    const input = {
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_02",
      policy: policy("Ember", "check"),
      idempotencyKey: "join-ember-002",
    };
    const first = await service.enroll(input);
    await expect(service.enroll(input)).resolves.toEqual(first);
    expect(unwrapCount).toBe(1);
    await expect(service.enroll({
      ...input,
      policy: policy("Ember changed", "raise"),
    })).resolves.toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(unwrapCount).toBe(1);
  });

  it("returns an exact retry after the season locks without another key operation", async () => {
    const previewProvider = createPreviewKeyProvider();
    let unwrapCount = 0;
    const keyProvider: KeyProvider = {
      wrap: (dataKey, projectId) => previewProvider.wrap(dataKey, projectId),
      async unwrap(wrappedKey, projectId) {
        unwrapCount += 1;
        return previewProvider.unwrap(wrappedKey, projectId);
      },
    };
    const { repositories, projectId, season, service } = await setup({}, keyProvider);
    const input = {
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_22",
      policy: policy("Ember", "check"),
      idempotencyKey: "join-ember-022",
    };
    const first = await service.enroll(input);
    await repositories.projects.updateArenaSeason({ ...season, status: "locked", lockedAt: now });
    await expect(service.enroll(input)).resolves.toEqual(first);
    expect(unwrapCount).toBe(1);
  });

  it.each([
    ["missing", "missing" as const],
    ["pending", "funding_pending" as const],
  ])("allows a real competition to accept agents with a %s prize pool", async (_label, prizeStatus) => {
    const { projectId, season, service } = await setup({}, createPreviewKeyProvider(), prizeStatus);
    const result = await service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_23",
      policy: agentPackage("EMBER_23", "Ember"),
      idempotencyKey: "join-ember-023",
    });
    if (!result.ok) throw new Error(result.code);
    expect(result).toMatchObject({ ok: true, value: { agentId: "EMBER_23" } });
  });

  it("rejects a package whose internal agent id differs from the submitted id", async () => {
    const { projectId, season, service } = await setup();
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_24",
      policy: agentPackage("NIGHTJAR_24", "Nightjar"),
      idempotencyKey: "join-ember-024",
    })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
  });

  it("requires explicit confirmation before replacing a wallet's active agent", async () => {
    const { projectId, season, service } = await setup();
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_03",
      policy: policy("Ember", "check"),
      idempotencyKey: "join-ember-003",
    })).resolves.toMatchObject({ ok: true });
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "NOVA_03",
      policy: policy("Nova", "raise"),
      idempotencyKey: "join-nova-0003",
    })).resolves.toEqual({ ok: false, code: "ARENA_REPLACEMENT_CONFIRMATION_REQUIRED" });
  });

  it("atomically replaces the active agent while preserving sealed immutable versions", async () => {
    const { repositories, projectId, season, service } = await setup();
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_V1",
      policy: agentPackage("EMBER_V1", "Ember one"),
      idempotencyKey: "join-ember-version-001",
    })).resolves.toMatchObject({ ok: true, value: { version: 1 } });

    const replacementInput = {
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_V2",
      policy: agentPackage("EMBER_V2", "Ember two"),
      idempotencyKey: "join-ember-version-002",
      replaceExisting: true,
    };
    const replaced = await service.enroll(replacementInput);
    expect(replaced).toMatchObject({
      ok: true,
      value: {
        agentId: "EMBER_V2",
        version: 2,
        versions: [
          { version: 1, agentId: "EMBER_V1", status: "retired" },
          { version: 2, agentId: "EMBER_V2", status: "active" },
        ],
      },
    });
    await expect(service.enroll(replacementInput)).resolves.toEqual(replaced);

    const entries = await repositories.projects.listArenaSeasonEntries(projectId, season.id);
    const artifacts = await repositories.projects.listArenaStrategyArtifacts(projectId);
    const versions = await repositories.projects.listArenaEntryVersions(projectId, season.id, entries[0]!.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ agentId: "EMBER_V2", version: 2 });
    expect(artifacts.map((artifact) => artifact.agentId)).toEqual(["EMBER_V1", "EMBER_V2"]);
    expect(versions).toMatchObject([
      { version: 1, status: "retired", agentId: "EMBER_V1" },
      { version: 2, status: "active", agentId: "EMBER_V2" },
    ]);
    expect(JSON.stringify(versions)).not.toContain("fallbackAction");
    expect(JSON.stringify(versions)).not.toContain("handCategories");
  });

  it("keeps the current agent active when a replacement package fails validation", async () => {
    const { repositories, projectId, season, service } = await setup();
    await service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_SAFE_1",
      policy: agentPackage("EMBER_SAFE_1", "Ember safe"),
      idempotencyKey: "join-ember-safe-001",
    });
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_BAD_2",
      policy: { executable: "do not accept" },
      idempotencyKey: "join-ember-safe-002",
      replaceExisting: true,
    })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    const entry = await repositories.projects.getArenaSeasonEntryByOwnerFingerprint(
      projectId,
      season.id,
      fingerprintWallet(playerOne, "test-wallet-pepper-0123456789012345"),
    );
    expect(entry).toMatchObject({ agentId: "EMBER_SAFE_1", version: 1 });
  });

  it("counts only three accepted versions per UTC day", async () => {
    const { projectId, season, service } = await setup();
    for (const [index, agentId] of ["EMBER_DAY_1", "EMBER_DAY_2", "EMBER_DAY_3"].entries()) {
      const result = await service.enroll({
        projectId,
        seasonId: season.id,
        actorWalletAddress: playerOne,
        agentId,
        policy: agentPackage(agentId, `Ember day ${index + 1}`),
        idempotencyKey: `join-ember-day-00${index + 1}`,
        replaceExisting: index > 0,
      });
      expect(result).toMatchObject({ ok: true, value: { version: index + 1 } });
    }
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_DAY_4",
      policy: agentPackage("EMBER_DAY_4", "Ember day four"),
      idempotencyKey: "join-ember-day-004",
      replaceExisting: true,
    })).resolves.toEqual({ ok: false, code: "ARENA_SUBMISSION_LIMIT_REACHED" });
  });

  it("forbids replacement when the tournament locked a fixed roster policy", async () => {
    const fixedRules = resolveTournamentRules({ templateId: "championship" });
    const { projectId, season, service } = await setup({
      templateId: "championship",
      rulesSnapshot: fixedRules,
      rulesCommitment: tournamentRulesCommitment(fixedRules),
    });
    await service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_FIXED_1",
      policy: agentPackage("EMBER_FIXED_1", "Ember fixed"),
      idempotencyKey: "join-ember-fixed-001",
    });
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_FIXED_2",
      policy: agentPackage("EMBER_FIXED_2", "Ember fixed two"),
      idempotencyKey: "join-ember-fixed-002",
      replaceExisting: true,
    })).resolves.toEqual({ ok: false, code: "ARENA_RESUBMISSION_FORBIDDEN" });
  });

  it("serializes concurrent joins at the season capacity", async () => {
    const { repositories, projectId, season, service } = await setup();
    const results = await Promise.all([
      [playerOne, "EMBER_04", "join-ember-004"],
      [playerTwo, "NOVA_004", "join-nova-0004"],
      [playerThree, "CINDER_4", "join-cinder-04"],
    ].map(([actorWalletAddress, agentId, idempotencyKey], index) => service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress,
      agentId,
      policy: policy(`Player ${index + 1}`, "check"),
      idempotencyKey,
    })));
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: "ARENA_SEASON_FULL" }]);
    await expect(repositories.projects.listArenaSeasonEntries(projectId, season.id)).resolves.toHaveLength(2);
    await expect(repositories.projects.listArenaStrategyArtifacts(projectId)).resolves.toHaveLength(2);
  });

  it.each([
    ["invite only", { entryMode: "invite_only" as const }, "ARENA_SEASON_NOT_PUBLIC"],
    ["not started", { startsAt: new Date("2026-08-30T12:01:00.000Z") }, "ARENA_SEASON_NOT_STARTED"],
    ["closed", { locksAt: now }, "ARENA_SEASON_CLOSED"],
    ["locked", { status: "locked" as const }, "ARENA_SEASON_NOT_OPEN"],
  ])("rejects a %s season", async (_label, overrides, code) => {
    const { projectId, season, service } = await setup(overrides);
    await expect(service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_05",
      policy: policy("Ember", "check"),
      idempotencyKey: "join-ember-005",
    })).resolves.toEqual({ ok: false, code });
  });

  it("returns only the authenticated wallet's entry", async () => {
    const { projectId, season, service } = await setup();
    await service.enroll({
      projectId,
      seasonId: season.id,
      actorWalletAddress: playerOne,
      agentId: "EMBER_06",
      policy: policy("Ember", "check"),
      idempotencyKey: "join-ember-006",
    });
    await expect(service.getMyEntry({ projectId, seasonId: season.id, actorWalletAddress: playerOne }))
      .resolves.toMatchObject({ ok: true, value: { agentId: "EMBER_06" } });
    await expect(service.getMyEntry({ projectId, seasonId: season.id, actorWalletAddress: playerTwo }))
      .resolves.toEqual({ ok: true, value: null });
  });
});
