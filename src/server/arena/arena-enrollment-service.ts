import { randomUUID } from "node:crypto";

import { commitment } from "@/domain/canonical";
import {
  parseStrategyArtifactPayload,
  strategyPayloadCommitment,
} from "@/domain/arena/strategy-policy";
import { normalizeFeltAddress } from "@/lib/strk20/address";
import { encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type {
  ArenaEntryVersionRecord,
  ArenaSeasonEntryRecord,
  ProjectRepository,
} from "@/server/db/repositories";
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
  | "ARENA_REPLACEMENT_CONFIRMATION_REQUIRED"
  | "ARENA_RESUBMISSION_FORBIDDEN"
  | "ARENA_REPLACEMENT_AGENT_ID_REQUIRED"
  | "ARENA_SUBMISSION_LIMIT_REACHED"
  | "ARENA_ENTRY_VERSION_CONFLICT"
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
  version: number;
  joinedAt: string;
  versions: Array<{
    version: number;
    agentId: string;
    displayName: string;
    artifactCommitment: string;
    status: "active" | "retired";
    submittedAt: string;
    retiredAt?: string;
  }>;
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
const successfulSubmissionLimitPerUtcDay = 3;

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
  if (error.message === "ARENA_RESUBMISSION_FORBIDDEN") return "ARENA_RESUBMISSION_FORBIDDEN";
  if (error.message === "ARENA_ENTRY_VERSION_CONFLICT") return "ARENA_ENTRY_VERSION_CONFLICT";
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

function view(record: ArenaSeasonEntryRecord, versions: ArenaEntryVersionRecord[] = []): ArenaEnrollmentView {
  const history = versions.length > 0 ? versions : [{
    id: `${record.id}:v${record.version}`,
    entryId: record.id,
    seasonId: record.seasonId,
    projectId: record.projectId,
    version: record.version,
    agentId: record.agentId,
    displayName: record.displayName,
    artifactCommitment: record.artifactCommitment,
    status: "active" as const,
    submittedAt: record.joinedAt,
  }];
  return {
    id: record.id,
    seasonId: record.seasonId,
    agentId: record.agentId,
    displayName: record.displayName,
    artifactCommitment: record.artifactCommitment,
    version: record.version,
    joinedAt: record.joinedAt.toISOString(),
    versions: history.map((item) => ({
      version: item.version,
      agentId: item.agentId,
      displayName: item.displayName,
      artifactCommitment: item.artifactCommitment,
      status: item.status,
      submittedAt: item.submittedAt.toISOString(),
      ...(item.retiredAt ? { retiredAt: item.retiredAt.toISOString() } : {}),
    })),
  };
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
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
    replaceExisting?: boolean;
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
        ...(input.replaceExisting ? { replaceExisting: true } : {}),
      });

      const existingByKey = await this.repositories.getArenaSeasonEntryByIdempotencyKey(
        projectId,
        seasonId,
        input.idempotencyKey,
      );
      if (existingByKey) {
        if (existingByKey.requestDigest !== requestDigest) return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
        const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, existingByKey.id);
        return { ok: true, value: view(existingByKey, versions) };
      }
      const existingOwner = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(
        projectId,
        seasonId,
        actorFingerprint,
      );
      if (existingOwner) {
        if (existingOwner.requestDigest === requestDigest) {
          const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, existingOwner.id);
          return { ok: true, value: view(existingOwner, versions) };
        }
        if (!input.replaceExisting) return { ok: false, code: "ARENA_REPLACEMENT_CONFIRMATION_REQUIRED" };
        if (season.rulesSnapshot?.resubmissionPolicy !== "replace_until_lock") {
          return { ok: false, code: "ARENA_RESUBMISSION_FORBIDDEN" };
        }
        if (existingOwner.agentId === agentId) return { ok: false, code: "ARENA_REPLACEMENT_AGENT_ID_REQUIRED" };
        if (season.status !== "open") return { ok: false, code: "ARENA_SEASON_NOT_OPEN" };
        if ((season.entryMode ?? "invite_only") !== "open") return { ok: false, code: "ARENA_SEASON_NOT_PUBLIC" };
        if (now < season.startsAt) return { ok: false, code: "ARENA_SEASON_NOT_STARTED" };
        if (now >= season.locksAt) return { ok: false, code: "ARENA_SEASON_CLOSED" };

        const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, existingOwner.id);
        const dayStart = utcDayStart(now).getTime();
        const acceptedToday = versions.filter((item) => item.submittedAt.getTime() >= dayStart).length;
        if (acceptedToday >= successfulSubmissionLimitPerUtcDay) {
          return { ok: false, code: "ARENA_SUBMISSION_LIMIT_REACHED" };
        }
        const existingArtifact = await this.repositories.getArenaStrategyArtifact(projectId, agentId);
        if (existingArtifact) return { ok: false, code: "STRATEGY_ARTIFACT_ALREADY_EXISTS" };

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
        const nextVersion = existingOwner.version + 1;
        const entry: ArenaSeasonEntryRecord = {
          ...existingOwner,
          agentId,
          displayName: artifact.displayName,
          artifactCommitment: artifact.artifactCommitment,
          version: nextVersion,
          idempotencyKey: input.idempotencyKey,
          requestDigest,
        };
        const version: ArenaEntryVersionRecord = {
          id: `${entry.id}:v${nextVersion}`,
          entryId: entry.id,
          seasonId,
          projectId,
          version: nextVersion,
          agentId,
          displayName: artifact.displayName,
          artifactCommitment: artifact.artifactCommitment,
          status: "active",
          submittedAt: now,
          idempotencyKey: input.idempotencyKey,
          requestDigest,
        };
        await this.repositories.replaceArenaEnrollment({
          artifact,
          entry,
          previousVersion: existingOwner.version,
          version,
          now,
          audit: {
            id: this.idFactory(),
            projectId,
            actorFingerprint,
            eventType: "public_arena_entry_replaced",
            payloadDigest: commitment({
              seasonId,
              entryId: entry.id,
              previousVersion: existingOwner.version,
              previousArtifactCommitment: existingOwner.artifactCommitment,
              nextVersion,
              nextArtifactCommitment: artifact.artifactCommitment,
            }),
            createdAt: now,
          },
        });
        return { ok: true, value: view(entry, [...versions.map((item) => item.status === "active"
          ? { ...item, status: "retired" as const, retiredAt: now }
          : item), version]) };
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
        version: 1,
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
          if (existingByKey?.requestDigest === requestDigest) {
            const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, existingByKey.id);
            return { ok: true, value: view(existingByKey, versions) };
          }
          const existingOwner = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(
            projectId,
            seasonId,
            actorFingerprint,
          );
          if (existingOwner?.requestDigest === requestDigest) {
            const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, existingOwner.id);
            return { ok: true, value: view(existingOwner, versions) };
          }
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
      if (!entry) return { ok: true, value: null };
      const versions = await this.repositories.listArenaEntryVersions(projectId, seasonId, entry.id);
      return { ok: true, value: view(entry, versions) };
    } catch (error) {
      return { ok: false, code: mapError(error) };
    }
  }
}
