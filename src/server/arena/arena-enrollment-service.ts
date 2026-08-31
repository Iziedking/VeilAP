import { randomUUID } from "node:crypto";

import { commitment } from "@/domain/canonical";
import {
  parseStrategyArtifactPayload,
  strategyPayloadCommitment,
} from "@/domain/arena/strategy-policy";
import { normalizeFeltAddress } from "@/lib/strk20/address";
import { encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type { ArenaSeasonEntryRecord, ProjectRepository } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

import { buildStrategyArtifact } from "./strategy-artifacts";

export type ArenaEnrollmentErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "ARENA_SEASON_NOT_FOUND"
  | "ARENA_SEASON_NOT_OPEN"
  | "ARENA_SEASON_NOT_PUBLIC"
  | "ARENA_SEASON_NOT_STARTED"
  | "ARENA_SEASON_CLOSED"
  | "ARENA_SEASON_FULL"
  | "ARENA_WALLET_ALREADY_ENTERED"
  | "STRATEGY_ARTIFACT_ALREADY_EXISTS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type ArenaEnrollmentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ArenaEnrollmentErrorCode };

export interface ArenaEnrollmentView {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  joinedAt: string;
}

export interface ArenaEnrollmentServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
}

const agentIdPattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const idempotencyKeyPattern = /^[\x21-\x7e]{8,200}$/;

function mapError(error: unknown): ArenaEnrollmentErrorCode {
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (
    error.message === "STRATEGY_POLICY_INVALID"
    || error.message === "AGENT_PACKAGE_INVALID"
    || error.message === "STRATEGY_ARTIFACT_ID_INVALID"
    || error.message === "STRATEGY_OWNER_INVALID"
  ) return "INVALID_INPUT";
  if (error.message === "ARENA_SEASON_NOT_FOUND") return "ARENA_SEASON_NOT_FOUND";
  if (error.message === "ARENA_SEASON_NOT_OPEN") return "ARENA_SEASON_NOT_OPEN";
  if (error.message === "ARENA_SEASON_NOT_PUBLIC") return "ARENA_SEASON_NOT_PUBLIC";
  if (error.message === "ARENA_SEASON_NOT_STARTED") return "ARENA_SEASON_NOT_STARTED";
  if (error.message === "ARENA_SEASON_CLOSED") return "ARENA_SEASON_CLOSED";
  if (error.message === "ARENA_SEASON_FULL") return "ARENA_SEASON_FULL";
  if (error.message === "ARENA_WALLET_ALREADY_ENTERED") return "ARENA_WALLET_ALREADY_ENTERED";
  if (
    error.message === "ARENA_ARTIFACT_ALREADY_EXISTS"
    || error.message === "ARENA_ARTIFACT_COMMITMENT_ALREADY_EXISTS"
    || error.message === "ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS"
  ) return "STRATEGY_ARTIFACT_ALREADY_EXISTS";
  if (error.message.includes("IDEMPOTENCY")) return "IDEMPOTENCY_KEY_REUSED";
  if (error.message.includes("ENVELOPE_") || error.message.includes("KEY_") || error.message.includes("KMS_")) {
    return "ENCRYPTION_FAILED";
  }
  return "PERSISTENCE_FAILED";
}

function view(record: ArenaSeasonEntryRecord): ArenaEnrollmentView {
  return {
    id: record.id,
    seasonId: record.seasonId,
    agentId: record.agentId,
    displayName: record.displayName,
    artifactCommitment: record.artifactCommitment,
    joinedAt: record.joinedAt.toISOString(),
  };
}

export class ArenaEnrollmentService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: ArenaEnrollmentServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async enroll(input: {
    projectId: string;
    seasonId: string;
    actorWalletAddress: string;
    agentId: string;
    policy: unknown;
    idempotencyKey: string;
  }): Promise<ArenaEnrollmentResult<ArenaEnrollmentView>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    const agentId = input.agentId.trim().toUpperCase();
    const payoutWalletAddress = normalizeFeltAddress(input.actorWalletAddress);
    if (
      !projectId
      || !seasonId
      || !agentIdPattern.test(agentId)
      || !payoutWalletAddress
      || !idempotencyKeyPattern.test(input.idempotencyKey)
    ) return { ok: false, code: "INVALID_INPUT" };

    let requestDigest: string | undefined;
    let actorFingerprint: string | undefined;
    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      const now = this.now();
      actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const parsedPolicy = parseStrategyArtifactPayload(input.policy);
      if ("protocolVersion" in parsedPolicy && parsedPolicy.agentId !== agentId) {
        return { ok: false, code: "INVALID_INPUT" };
      }
      const artifactCommitment = strategyPayloadCommitment(parsedPolicy);
      requestDigest = commitment({
        actorFingerprint,
        seasonId,
        agentId,
        artifactCommitment,
      });

      const existingByKey = await this.repositories.getArenaSeasonEntryByIdempotencyKey(
        projectId,
        seasonId,
        input.idempotencyKey,
      );
      if (existingByKey) {
        return existingByKey.requestDigest === requestDigest
          ? { ok: true, value: view(existingByKey) }
          : { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
      }
      const existingOwner = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(
        projectId,
        seasonId,
        actorFingerprint,
      );
      if (existingOwner) {
        return existingOwner.requestDigest === requestDigest
          ? { ok: true, value: view(existingOwner) }
          : { ok: false, code: "ARENA_WALLET_ALREADY_ENTERED" };
      }

      if (season.status !== "open") return { ok: false, code: "ARENA_SEASON_NOT_OPEN" };
      if ((season.entryMode ?? "invite_only") !== "open") return { ok: false, code: "ARENA_SEASON_NOT_PUBLIC" };
      if (now < season.startsAt) return { ok: false, code: "ARENA_SEASON_NOT_STARTED" };
      if (now >= season.locksAt) return { ok: false, code: "ARENA_SEASON_CLOSED" };
      const existingArtifact = await this.repositories.getArenaStrategyArtifact(projectId, agentId);
      if (existingArtifact) return { ok: false, code: "STRATEGY_ARTIFACT_ALREADY_EXISTS" };

      const entries = await this.repositories.listArenaSeasonEntries(projectId, seasonId);
      if (entries.length >= (season.maxEntries ?? 16)) return { ok: false, code: "ARENA_SEASON_FULL" };

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, projectId);
      const keyMaterial = { dataKey, wrappedKey: project.wrappedDataKey };
      const artifact = buildStrategyArtifact({
        projectId,
        agentId,
        policy: parsedPolicy,
        keyMaterial,
        ownerFingerprint: actorFingerprint,
        ownerWalletAddress: input.actorWalletAddress,
        now: () => now,
        idFactory: this.idFactory,
      });
      const entryId = this.idFactory();
      const entry: ArenaSeasonEntryRecord = {
        id: entryId,
        seasonId,
        projectId,
        agentId,
        displayName: artifact.displayName,
        artifactCommitment: artifact.artifactCommitment,
        ownerFingerprint: actorFingerprint,
        encryptedPayoutWallet: encryptField(
          payoutWalletAddress,
          { projectId, recordType: "arena_season_entry", recordId: entryId, fieldName: "payout_wallet" },
          keyMaterial,
        ),
        joinedAt: now,
        idempotencyKey: input.idempotencyKey,
        requestDigest,
      };
      await this.repositories.saveArenaEnrollment({
        artifact,
        entry,
        now,
        audit: {
          id: this.idFactory(),
          projectId,
          actorFingerprint,
          eventType: "public_arena_entry_registered",
          payloadDigest: commitment({
            seasonId,
            agentId,
            artifactCommitment: artifact.artifactCommitment,
          }),
          createdAt: now,
        },
      });
      return { ok: true, value: view(entry) };
    } catch (error) {
      if (requestDigest && actorFingerprint) {
        try {
          const existingByKey = await this.repositories.getArenaSeasonEntryByIdempotencyKey(
            projectId,
            seasonId,
            input.idempotencyKey,
          );
          if (existingByKey?.requestDigest === requestDigest) return { ok: true, value: view(existingByKey) };
          const existingOwner = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(
            projectId,
            seasonId,
            actorFingerprint,
          );
          if (existingOwner?.requestDigest === requestDigest) return { ok: true, value: view(existingOwner) };
        } catch {
          return { ok: false, code: "PERSISTENCE_FAILED" };
        }
      }
      return { ok: false, code: mapError(error) };
    }
  }

  async getMyEntry(input: {
    projectId: string;
    seasonId: string;
    actorWalletAddress: string;
  }): Promise<ArenaEnrollmentResult<ArenaEnrollmentView | null>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    if (!projectId || !seasonId) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      const ownerFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const entry = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(projectId, seasonId, ownerFingerprint);
      return { ok: true, value: entry ? view(entry) : null };
    } catch (error) {
      return { ok: false, code: mapError(error) };
    }
  }
}
