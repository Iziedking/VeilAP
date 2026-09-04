import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { sql } from "drizzle-orm";
import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";
import { resolveTournamentRules, tournamentRulesCommitment } from "@/domain/arena/tournament-rules";
import { createMemoryRepositories, createPostgresRepositories, type ArenaSeasonRecord } from "@/server/db/repositories";
import { getDatabase } from "@/server/db/client";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createReceiptSigner } from "@/server/receipts/signing";
import { ProjectService } from "@/server/projects/project-service";
import { ArenaEnrollmentService } from "./arena-enrollment-service";
import { ArenaSeasonService } from "./arena-season-service";
import { ArenaMatchService } from "./arena-match-service";
import { buildStrategyArtifact } from "./strategy-artifacts";
import { ParticipantAgentService } from "./participant-agent-service";

const now = new Date("2026-09-04T12:00:00Z");
const pack = (agentId: string, action = "call") => ({ protocolVersion: "veil-agent.v1", engineVersion: ARENA_ENGINE_VERSION, agentId, displayName: agentId,
  policy: { rules: [{ when: { pocketPair: true }, action: "raise" }], fallbackAction: action } });
const databaseUrl = process.env.TEST_DATABASE_URL;

for (const backend of ["memory", "postgres"] as const) {
  describe.skipIf(backend === "postgres" && !databaseUrl)(`duplicate strategy admission (${backend})`, () => {
    async function setup(privateSeason = false) {
      if (backend === "postgres") {
        const target = new URL(databaseUrl!);
        if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/veil_promise_audit") throw new Error("DISPOSABLE_DATABASE_REQUIRED");
      }
      const db = backend === "postgres" ? getDatabase(databaseUrl) : undefined;
      const repositories = db ? createPostgresRepositories(db) : createMemoryRepositories();
      const keyProvider = createPreviewKeyProvider();
      const dependencies = { repositories: repositories.projects, keyProvider, walletHashPepper: "duplicate-test-pepper-".repeat(3), now: () => now, idFactory: randomUUID };
      const project = await new ProjectService(dependencies).createProject({ name: "Disposable duplicate test", walletAddress: "0x1" });
      if (!project.ok) throw new Error(project.code);
      const projectId = project.value.id;
      const rules = resolveTournamentRules({ templateId: privateSeason ? "friend_challenge" : "playground" });
      const season: ArenaSeasonRecord = { id: randomUUID(), projectId, name: "Exact strategy rule", rulesetVersion: ARENA_ENGINE_VERSION,
        startsAt: new Date(now.getTime() - 3600000), locksAt: new Date(now.getTime() + 3600000), endsAt: new Date(now.getTime() + 7200000),
        status: "open", entryMode: privateSeason ? "invite_only" : "open", maxEntries: 8, templateId: rules.templateId, templateVersion: rules.templateVersion,
        rulesSnapshot: rules, rulesCommitment: tournamentRulesCommitment(rules), createdBy: "test", createdAt: now };
      await repositories.projects.saveArenaSeason(season);
      const service = new ArenaEnrollmentService(dependencies);
      const pair = generateKeyPairSync("ed25519");
      const matchService = new ArenaMatchService({ ...dependencies, signer: createReceiptSigner({ privateKeyBase64: pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"), publicKeyBase64: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64") }) });
      const seasons = new ArenaSeasonService({ ...dependencies, matchService });
      const join = (owner: string, agentId: string, action = "call", replaceExisting = false, targetSeason = season.id) => service.enroll({ projectId, seasonId: targetSeason, actorWalletAddress: owner, agentId, policy: pack(agentId, action), replaceExisting, idempotencyKey: `join-${agentId}` });
      const cleanup = async () => {
        if (!db) return;
        for (const owner of ["0xa", "0xb"]) await db.execute(sql`delete from participant_agent_packages where owner_fingerprint = ${fingerprintWallet(owner, dependencies.walletHashPepper)} and agent_id = 'SHARED_LIBRARY'`);
        for (const table of ["arena_entry_versions", "arena_season_entries", "arena_strategy_artifacts", "arena_seasons", "audit_events", "project_members", "projects"]) {
          const column = table === "projects" ? "id" : "project_id";
          await db.execute(sql`delete from ${sql.identifier(table)} where ${sql.identifier(column)} = ${projectId}`);
        }
      };
      return { db, repositories: repositories.projects, keyProvider, dependencies, projectId, season, service, seasons, join, cleanup };
    }

    if (backend === "postgres") it("applies the additive migration to populated legacy rows without rewriting them", async () => {
      const f = await setup();
      try {
        const migration = await readFile("drizzle/0024_competition_strategy_uniqueness.sql", "utf8");
        const schema = `strategy_upgrade_${randomBytes(8).toString("hex")}`;
        await expect(f.db!.transaction(async tx => {
          await tx.execute(sql`create schema ${sql.identifier(schema)}`);
          await tx.execute(sql`set local search_path to ${sql.identifier(schema)}`);
          await tx.execute(sql.raw("create table arena_seasons (id text, project_id text, rules_snapshot jsonb); create table arena_season_entries (id text, season_id text, project_id text, agent_id text, artifact_commitment text);"));
          await tx.execute(sql.raw("insert into arena_seasons values ('old-season','old-project','{\"templateVersion\":1}'::jsonb); insert into arena_season_entries values ('old-a','old-season','old-project','A','receipt-a'), ('old-b','old-season','old-project','B','receipt-b');"));
          const before = (await tx.execute(sql.raw("select * from arena_season_entries order by id"))).rows;
          await tx.execute(sql.raw(migration));
          const after = (await tx.execute(sql.raw("select id, season_id, project_id, agent_id, artifact_commitment from arena_season_entries order by id"))).rows;
          expect(after).toEqual(before);
          expect((await tx.execute(sql.raw("select count(*)::int as count from arena_season_entries where strategy_fingerprint is not null"))).rows[0]).toEqual({ count: 0 });
          throw new Error("ROLLBACK_DISPOSABLE_UPGRADE_PROBE");
        })).rejects.toThrow("ROLLBACK_DISPOSABLE_UPGRADE_PROBE");
      } finally { await f.cleanup(); }
    });

    it("accepts exactly one concurrent first entry and one concurrent policy replacement", async () => {
      const f = await setup();
      try {
        const first = await Promise.all([f.join("0x2", "RACE_A"), f.join("0x3", "RACE_B")]);
        expect(first.filter(result => result.ok)).toHaveLength(1);
        expect(first.find(result => !result.ok)).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        const secondOwner = first[0].ok ? "0x3" : "0x2";
        expect(await f.join(secondOwner, "DISTINCT", "fold")).toMatchObject({ ok: true });
        const updates = await Promise.all([f.join("0x2", "UPDATE_A", "check", true), f.join("0x3", "UPDATE_B", "check", true)]);
        expect(updates.filter(result => result.ok)).toHaveLength(1);
        expect(updates.find(result => !result.ok)).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        expect(await f.repositories.listArenaStrategyArtifacts(f.projectId)).toHaveLength(3);
        const entries = await f.repositories.listArenaSeasonEntries(f.projectId, f.season.id);
        expect(entries.map(entry => entry.version).sort()).toEqual([1, 2]);
      } finally { await f.cleanup(); }
    });

    it("serializes renamed copies, rolls back rejected replacements and preserves history", async () => {
      const f = await setup();
      try {
        const first = await f.join("0x2", "FIRST");
        expect(first.ok).toBe(true);
        const stored = await f.repositories.getArenaSeasonEntry(f.projectId, f.season.id, "FIRST");
        expect(stored?.strategyFingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(first)).not.toContain(stored!.strategyFingerprint!);
        expect(await f.join("0x2", "FIRST")).toEqual(first);
        const attempts = await Promise.all(["0x3", "0x4"].map((owner, i) => f.join(owner, `RENAMED_${i}`)));
        expect(attempts).toEqual([{ ok: false, code: "ARENA_DUPLICATE_STRATEGY" }, { ok: false, code: "ARENA_DUPLICATE_STRATEGY" }]);
        expect(await f.repositories.listArenaStrategyArtifacts(f.projectId)).toHaveLength(1);
        expect(await f.join("0x3", "SECOND", "fold")).toMatchObject({ ok: true });
        const original = await f.repositories.getArenaSeasonEntry(f.projectId, f.season.id, "SECOND");
        const history = await f.repositories.listArenaEntryVersions(f.projectId, f.season.id, original!.id);
        expect(await f.join("0x3", "COPIED_UPDATE", "call", true)).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        expect(await f.repositories.getArenaSeasonEntry(f.projectId, f.season.id, "SECOND")).toEqual(original);
        expect(await f.repositories.listArenaEntryVersions(f.projectId, f.season.id, original!.id)).toEqual(history);
        expect(await f.repositories.getArenaStrategyArtifact(f.projectId, "COPIED_UPDATE")).toBeUndefined();
        expect(await f.join("0x2", "FIRST_RENAMED", "call", true)).toMatchObject({ ok: true, value: { version: 2 } });
        expect(await f.join("0x2", "FIRST_CHANGED", "check", true)).toMatchObject({ ok: true, value: { version: 3 } });
        expect(await f.join("0x4", "RELEASED_POLICY", "call")).toMatchObject({ ok: true });
        expect(JSON.stringify(await f.seasons.getPublicSchedule(f.projectId, f.season.id))).not.toContain("strategyFingerprint");
      } finally { await f.cleanup(); }
    });

    it("allows cross-season and legacy copies while preserving saved agents", async () => {
      const f = await setup();
      try {
        expect(await f.join("0x2", "FIRST")).toMatchObject({ ok: true });
        const another = { ...f.season, id: randomUUID() };
        await f.repositories.saveArenaSeason(another);
        expect(await f.join("0x3", "OTHER_SEASON", "call", false, another.id)).toMatchObject({ ok: true });
        const a = await f.repositories.getArenaSeasonEntry(f.projectId, f.season.id, "FIRST");
        const b = await f.repositories.getArenaSeasonEntry(f.projectId, another.id, "OTHER_SEASON");
        expect(a!.strategyFingerprint).not.toBe(b!.strategyFingerprint);
        const rules = { ...f.season.rulesSnapshot!, templateVersion: 1 as const };
        delete rules.duplicateStrategyPolicy;
        const legacy = { ...f.season, id: randomUUID(), rulesSnapshot: rules, templateVersion: 1, rulesCommitment: tournamentRulesCommitment(rules) };
        await f.repositories.saveArenaSeason(legacy);
        for (let i = 0; i < 2; i++) expect(await f.join(`0x${i + 5}`, `LEGACY_${i}`, "call", false, legacy.id)).toMatchObject({ ok: true });
        expect((await f.repositories.getArenaSeason(f.projectId, legacy.id))!.rulesCommitment).toBe(legacy.rulesCommitment);
        const vault = new ParticipantAgentService({ repositories: f.repositories, walletHashPepper: f.dependencies.walletHashPepper, sessionSecret: "s".repeat(64), vaultKeys: { currentKeyId: "v1", keys: { v1: randomBytes(32).toString("hex") } } });
        for (const owner of ["0xa", "0xb"]) {
          expect(await vault.save({ actorWalletAddress: owner, agentPackage: pack("SHARED_LIBRARY") })).toMatchObject({ agentId: "SHARED_LIBRARY" });
        }
      } finally { await f.cleanup(); }
    });

    it("protects system and operator admission and refuses a missing private fingerprint", async () => {
      const f = await setup(true);
      try {
        expect(await f.service.enrollSystem({ projectId: f.projectId, seasonId: f.season.id, agentId: "SYSTEM_ONE", policy: pack("SYSTEM_ONE"), idempotencyKey: "system-one-key" })).toMatchObject({ ok: true });
        expect(await f.service.enrollSystem({ projectId: f.projectId, seasonId: f.season.id, agentId: "SYSTEM_TWO", policy: pack("SYSTEM_TWO"), idempotencyKey: "system-two-key" })).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        expect(await f.service.enroll({ projectId: f.projectId, seasonId: f.season.id, actorWalletAddress: "0x3", agentId: "INVITED_COPY", policy: pack("INVITED_COPY"), admission: "invite", idempotencyKey: "invited-copy-key" })).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        const project = await f.repositories.getProject(f.projectId);
        const dataKey = await f.keyProvider.unwrap(project!.wrappedDataKey, f.projectId);
        const artifact = buildStrategyArtifact({ projectId: f.projectId, agentId: "OPERATOR_COPY", policy: pack("OPERATOR_COPY"), keyMaterial: { dataKey, wrappedKey: project!.wrappedDataKey } });
        await f.repositories.saveArenaStrategyArtifact(artifact);
        expect(await f.seasons.registerEntry({ projectId: f.projectId, seasonId: f.season.id, actorWalletAddress: "0x1", agentId: "OPERATOR_COPY", idempotencyKey: "operator-copy-key" })).toEqual({ ok: false, code: "ARENA_DUPLICATE_STRATEGY" });
        const entry = await f.repositories.getArenaSeasonEntry(f.projectId, f.season.id, "SYSTEM_ONE");
        await expect(f.repositories.saveArenaSeasonEntry({ ...entry!, id: randomUUID(), agentId: "INDEX_COPY", idempotencyKey: "index-copy-key" })).rejects.toThrow("ARENA_DUPLICATE_STRATEGY");
        const missing = { ...entry!, id: randomUUID(), agentId: "MISSING_FP", strategyFingerprint: undefined, idempotencyKey: "missing-fingerprint" };
        await expect(f.repositories.saveArenaSeasonEntry(missing)).rejects.toThrow("ARENA_STRATEGY_FINGERPRINT_REQUIRED");
        if (f.db) {
          await expect(f.db.execute(sql`insert into arena_season_entries (id, season_id, project_id, agent_id, display_name, artifact_commitment, joined_at) values (${randomUUID()}, ${f.season.id}, ${f.projectId}, 'RAW_BYPASS', 'Raw bypass', 'raw', ${now.toISOString()})`)).rejects.toMatchObject({ cause: { message: "ARENA_STRATEGY_FINGERPRINT_REQUIRED" } });
        }
      } finally { await f.cleanup(); }
    });
  });
}
