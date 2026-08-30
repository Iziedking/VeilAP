import { randomUUID } from "node:crypto";

import { validateAndParseAddress } from "starknet";
import { z } from "zod";

import {
  ARENA_TRANSFER_AUTHORIZATION_TTL_MS,
  buildArenaTransferAuthorizationTypedData,
  type ArenaTransferAuthorization,
  type ArenaTransferPlan,
  type ArenaTransferOperation,
} from "@/domain/arena/transfer-authorization";
import { commitment } from "@/domain/canonical";
import type { PublicMatchReceipt } from "@/domain/arena/poker-engine";
import { authorizeProject } from "@/server/authorization/authorize";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type {
  ArenaPrizePoolRecord,
  ArenaPrizePoolStatus,
  ProjectRepository,
} from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { confirmStrk20Transaction, type ReceiptTraceProvider } from "@/lib/strk20/receipt";
import { normalizeFeltAddress } from "@/lib/strk20/address";

export type ArenaPrizePoolErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "ARENA_SEASON_NOT_FOUND"
  | "ARENA_SEASON_NOT_LOCKED"
  | "ARENA_SEASON_NOT_ACTIVE"
  | "ARENA_PRIZE_POOL_NOT_FOUND"
  | "ARENA_PRIZE_POOL_ALREADY_EXISTS"
  | "ARENA_PRIZE_POOL_ALREADY_FUNDED"
  | "ARENA_PRIZE_POOL_NOT_FUNDED"
  | "ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY"
  | "ARENA_PRIZE_POOL_ALREADY_SETTLED"
  | "ARENA_MATCH_NOT_COMPLETE"
  | "ARENA_WINNER_TIE"
  | "ARENA_WINNER_PAYOUT_NOT_REGISTERED"
  | "ARENA_SPONSOR_WALLET_REQUIRED"
  | "TRANSACTION_NOT_CONFIRMED"
  | "TRANSACTION_ALREADY_USED"
  | "TRANSFER_AUTHORIZATION_EXPIRED"
  | "TRANSFER_PLAN_MISMATCH"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_UNAVAILABLE"
  | "ARENA_PRIZE_POOL_STATE_CHANGED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type ArenaPrizePoolResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ArenaPrizePoolErrorCode };

export interface ArenaPrizePoolView {
  id: string;
  projectId: string;
  seasonId: string;
  tokenAddress: string;
  tokenSymbol: string;
  poolAddress: string;
  amountMinor: string;
  status: ArenaPrizePoolStatus;
  fundingTransactionHash?: string;
  fundingReceiptDigest?: string;
  winnerAgentId?: string;
  recipientFingerprint?: string;
  settlementTransactionHash?: string;
  settlementReceiptDigest?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArenaSettlementReceiptView {
  poolId: string;
  seasonId: string;
  winnerAgentId: string;
  fundingReceiptDigest: string;
  settlementReceiptDigest: string;
  settledAt: string;
}

export type ArenaFundingTransactionPlan = ArenaTransferPlan;

const transferAuthorizationSchema = z.object({
  schemaVersion: z.literal(1),
  chainId: z.literal("SN_MAIN"),
  operation: z.enum(["strk20_shield", "strk20_transfer"]),
  projectId: z.string().trim().min(1).max(120),
  seasonId: z.string().trim().min(1).max(120),
  poolId: z.string().trim().min(1).max(120),
  poolAddress: z.string().trim().min(3).max(80),
  tokenAddress: z.string().trim().min(3).max(80),
  tokenSymbol: z.string().trim().min(1).max(12),
  amountMinor: z.string().refine(amountMinor),
  recipient: z.string().trim().min(3).max(80),
  planDigest: z.string().regex(/^[0-9a-f]{64}$/),
  transactionHash: z.string().trim().min(3).max(80),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export const arenaTransferConfirmationSchema = z.object({
  authorization: transferAuthorizationSchema,
  signature: z.array(z.string().regex(/^(?:0x[0-9a-fA-F]+|[0-9]+)$/).max(80)).min(1).max(16),
}).strict();

export type ArenaTransferConfirmation = z.infer<typeof arenaTransferConfirmationSchema>;

export interface ArenaPrizePoolServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  receiptProvider: ReceiptTraceProvider;
  poolAddress: string;
  walletHashPepper: string;
  verifySignature: (
    typedData: ReturnType<typeof buildArenaTransferAuthorizationTypedData>,
    signature: string[],
    walletAddress: string,
  ) => Promise<boolean>;
  now?: () => Date;
  idFactory?: () => string;
}

function amountMinor(value: string): boolean {
  if (!/^[1-9][0-9]*$/.test(value) || value.length > 78) return false;
  return BigInt(value) <= (1n << 256n) - 1n;
}

function idempotencyKey(value: string): boolean {
  return /^[\x21-\x7e]{8,200}$/.test(value);
}

function transactionHash(value: string): string | undefined {
  const normalized = normalizeFeltAddress(value.trim());
  return normalized && normalized !== "0x0" ? normalized : undefined;
}

function transferPlan(
  pool: ArenaPrizePoolRecord,
  operation: ArenaTransferOperation,
  recipient: string,
): ArenaTransferPlan {
  const plan = {
    network: "SN_MAIN" as const,
    operation,
    projectId: pool.projectId,
    seasonId: pool.seasonId,
    poolId: pool.id,
    poolAddress: pool.poolAddress,
    tokenAddress: pool.tokenAddress,
    tokenSymbol: pool.tokenSymbol,
    amountMinor: pool.amountMinor,
    recipient,
  };
  return { ...plan, planDigest: commitment(plan) };
}

function sameTransferPlan(
  authorization: ArenaTransferAuthorization,
  expected: ArenaTransferPlan,
): boolean {
  return authorization.chainId === expected.network
    && authorization.operation === expected.operation
    && authorization.projectId === expected.projectId
    && authorization.seasonId === expected.seasonId
    && authorization.poolId === expected.poolId
    && normalizeFeltAddress(authorization.poolAddress) === expected.poolAddress
    && normalizeFeltAddress(authorization.tokenAddress) === expected.tokenAddress
    && authorization.tokenSymbol === expected.tokenSymbol
    && authorization.amountMinor === expected.amountMinor
    && normalizeFeltAddress(authorization.recipient) === expected.recipient
    && authorization.planDigest === expected.planDigest;
}

function mapAuthorizationCode(code: string): ArenaPrizePoolErrorCode {
  return code === "PROJECT_ACCESS_REQUIRED" ? "PROJECT_ACCESS_REQUIRED" : "ROLE_FORBIDDEN";
}

function mapPersistenceError(error: unknown): ArenaPrizePoolErrorCode {
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (error.message === "ARENA_PRIZE_POOL_ALREADY_EXISTS") return "ARENA_PRIZE_POOL_ALREADY_EXISTS";
  if (error.message === "ARENA_PRIZE_POOL_IDEMPOTENCY_ALREADY_EXISTS") return "IDEMPOTENCY_KEY_REUSED";
  if (error.message === "ARENA_PRIZE_TRANSACTION_ALREADY_USED") return "TRANSACTION_ALREADY_USED";
  if (error.message === "ARENA_PRIZE_POOL_STATE_CHANGED") return "ARENA_PRIZE_POOL_STATE_CHANGED";
  if (error.message.startsWith("ENVELOPE_") || error.message.startsWith("KMS_")) return "ENCRYPTION_FAILED";
  return "PERSISTENCE_FAILED";
}

function view(record: ArenaPrizePoolRecord): ArenaPrizePoolView {
  return {
    id: record.id,
    projectId: record.projectId,
    seasonId: record.seasonId,
    tokenAddress: record.tokenAddress,
    tokenSymbol: record.tokenSymbol,
    poolAddress: record.poolAddress,
    amountMinor: record.amountMinor,
    status: record.status,
    fundingTransactionHash: record.fundingTransactionHash,
    fundingReceiptDigest: record.fundingReceiptDigest,
    winnerAgentId: record.winnerAgentId,
    recipientFingerprint: record.recipientFingerprint,
    settlementTransactionHash: record.settlementTransactionHash,
    settlementReceiptDigest: record.settlementReceiptDigest,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function publicReceipt(record: { publicReceipt: unknown }): PublicMatchReceipt {
  return record.publicReceipt as PublicMatchReceipt;
}

function winnerFromMatches(
  matches: Array<{ leftAgentId: string; rightAgentId: string; publicReceipt: unknown }>,
): ArenaPrizePoolResult<string> {
  const points = new Map<string, number>();
  for (const match of matches) {
    const receipt = publicReceipt(match);
    const score = receipt.score;
    const entries = Object.entries(score);
    if (entries.length !== 2) return { ok: false, code: "ARENA_MATCH_NOT_COMPLETE" };
    const highest = Math.max(...entries.map(([, value]) => value));
    const leaders = entries.filter(([, value]) => value === highest);
    if (leaders.length !== 1) return { ok: false, code: "ARENA_WINNER_TIE" };
    points.set(leaders[0]![0], (points.get(leaders[0]![0]) ?? 0) + 3);
    const loser = entries.find(([agentId]) => agentId !== leaders[0]![0])?.[0];
    if (loser) points.set(loser, points.get(loser) ?? 0);
  }
  const ranked = [...points.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (ranked.length === 0) return { ok: false, code: "ARENA_MATCH_NOT_COMPLETE" };
  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) return { ok: false, code: "ARENA_WINNER_TIE" };
  return { ok: true, value: ranked[0]![0] };
}

export class ArenaPrizePoolService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly receiptProvider: ReceiptTraceProvider;
  private readonly poolAddress: string;
  private readonly walletHashPepper: string;
  private readonly verifySignature: ArenaPrizePoolServiceDependencies["verifySignature"];
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: ArenaPrizePoolServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.receiptProvider = dependencies.receiptProvider;
    this.poolAddress = normalizeFeltAddress(dependencies.poolAddress) ?? "";
    this.walletHashPepper = dependencies.walletHashPepper;
    this.verifySignature = dependencies.verifySignature;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async createPool(input: {
    projectId: string;
    seasonId: string;
    actorWalletAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    amountMinor: string;
    idempotencyKey: string;
  }): Promise<ArenaPrizePoolResult<ArenaPrizePoolView>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    const tokenAddress = normalizeFeltAddress(input.tokenAddress.trim());
    const tokenSymbol = input.tokenSymbol.trim().toUpperCase();
    if (!projectId || !seasonId || !tokenAddress || !tokenSymbol || tokenSymbol.length > 12 || !amountMinor(input.amountMinor) || !this.poolAddress || !idempotencyKey(input.idempotencyKey)) {
      return { ok: false, code: "INVALID_INPUT" };
    }
    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      if (season.status !== "open" && season.status !== "locked") {
        return { ok: false, code: "ARENA_SEASON_NOT_ACTIVE" };
      }
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, { projectId, walletFingerprint: actorFingerprint, action: "manage_arena_prize_pool" });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      const digest = commitment({ projectId, seasonId, tokenAddress, tokenSymbol, amountMinor: input.amountMinor, actorFingerprint });
      const existingByKey = await this.repositories.getArenaPrizePoolByCreateIdempotencyKey(projectId, input.idempotencyKey);
      if (existingByKey) return existingByKey.createRequestDigest === digest ? { ok: true, value: view(existingByKey) } : { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
      const existing = await this.repositories.getArenaPrizePool(projectId, seasonId);
      if (existing) return { ok: false, code: "ARENA_PRIZE_POOL_ALREADY_EXISTS" };
      const createdAt = this.now();
      const record: ArenaPrizePoolRecord = {
        id: this.idFactory(),
        projectId,
        seasonId,
        tokenAddress,
        tokenSymbol,
        poolAddress: this.poolAddress,
        amountMinor: input.amountMinor,
        sponsorFingerprint: actorFingerprint,
        status: "funding_pending",
        createIdempotencyKey: input.idempotencyKey,
        createRequestDigest: digest,
        createdAt,
        updatedAt: createdAt,
      };
      await this.repositories.saveArenaPrizePool(record);
      await this.repositories.saveAuditEvent({ id: this.idFactory(), projectId, actorFingerprint, eventType: "arena_prize_pool_created", payloadDigest: commitment({ poolId: record.id, seasonId, amountMinor: record.amountMinor }), createdAt });
      return { ok: true, value: view(record) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async confirmFunding(input: {
    projectId: string;
    seasonId: string;
    actorWalletAddress: string;
    confirmation: ArenaTransferConfirmation;
  }): Promise<ArenaPrizePoolResult<ArenaPrizePoolView>> {
    const parsed = arenaTransferConfirmationSchema.safeParse(input.confirmation);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const normalizedTransactionHash = transactionHash(parsed.data.authorization.transactionHash);
    if (!normalizedTransactionHash) return { ok: false, code: "INVALID_INPUT" };
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      if (!pool) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
      const actorAddress = normalizeFeltAddress(input.actorWalletAddress);
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      if (!actorAddress || actorFingerprint !== pool.sponsorFingerprint) {
        return { ok: false, code: "ARENA_SPONSOR_WALLET_REQUIRED" };
      }
      if (pool.status === "funded" || pool.status === "settlement_pending" || pool.status === "settled") {
        return pool.fundingTransactionHash === normalizedTransactionHash
          ? { ok: true, value: view(pool) }
          : { ok: false, code: "TRANSACTION_ALREADY_USED" };
      }
      const transferAuthorization = await this.verifyTransferAuthorization({
        confirmation: parsed.data,
        expectedPlan: transferPlan(pool, "strk20_shield", actorAddress),
        actorWalletAddress: actorAddress,
        transactionHash: normalizedTransactionHash,
      });
      if (!transferAuthorization.ok) return transferAuthorization;
      if (pool.status === "unknown" && (pool.settlementTransactionHash || pool.fundingTransactionHash !== normalizedTransactionHash)) {
        return { ok: false, code: "TRANSACTION_NOT_CONFIRMED" };
      }
      if (await this.repositories.getArenaPrizeTransaction(normalizedTransactionHash)) {
        return { ok: false, code: "TRANSACTION_ALREADY_USED" };
      }
      const confirmation = await confirmStrk20Transaction(this.receiptProvider, {
        transactionHash: normalizedTransactionHash,
        poolAddress: pool.poolAddress,
      });
      if (confirmation.kind !== "confirmed") {
        const unknown = { ...pool, status: "unknown" as const, fundingTransactionHash: normalizedTransactionHash, updatedAt: this.now() };
        await this.repositories.updateArenaPrizePool(unknown);
        return { ok: false, code: "TRANSACTION_NOT_CONFIRMED" };
      }
      const updatedAt = this.now();
      const project = await this.repositories.getProject(pool.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, pool.projectId);
      const authorizationDigest = commitment(transferAuthorization.value);
      const receiptDigest = commitment({
        chainReceiptDigest: confirmation.receiptDigest,
        authorizationDigest,
      });
      const next = { ...pool, status: "funded" as const, fundingTransactionHash: normalizedTransactionHash, fundingReceiptDigest: receiptDigest, updatedAt };
      await this.repositories.confirmArenaPrizePoolTransaction({
        pool: next,
        expectedStatus: pool.status,
        transaction: {
          transactionHash: normalizedTransactionHash,
          poolId: pool.id,
          projectId: pool.projectId,
          seasonId: pool.seasonId,
          operation: "funding",
          receiptDigest,
          authorizationDigest,
          encryptedAuthorization: encryptField(
            JSON.stringify(transferAuthorization.value),
            {
              projectId: pool.projectId,
              recordType: "arena_prize_transaction",
              recordId: normalizedTransactionHash,
              fieldName: "authorization",
            },
            { dataKey, wrappedKey: project.wrappedDataKey },
          ),
          createdAt: updatedAt,
        },
        audit: {
          id: this.idFactory(),
          projectId: pool.projectId,
          actorFingerprint,
          eventType: "arena_prize_pool_funded",
          payloadDigest: commitment({ poolId: pool.id, transactionHash: normalizedTransactionHash, receiptDigest, authorizationDigest }),
          createdAt: updatedAt,
        },
      });
      return { ok: true, value: view(next) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async getFundingTransactionPlan(input: { projectId: string; seasonId: string; actorWalletAddress: string }): Promise<ArenaPrizePoolResult<ArenaFundingTransactionPlan>> {
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      if (!pool) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
      const actorAddress = normalizeFeltAddress(input.actorWalletAddress);
      if (!actorAddress || fingerprintWallet(input.actorWalletAddress, this.walletHashPepper) !== pool.sponsorFingerprint) {
        return { ok: false, code: "ARENA_SPONSOR_WALLET_REQUIRED" };
      }
      if (pool.status === "funded" || pool.status === "settlement_pending" || pool.status === "settled") {
        return { ok: false, code: "ARENA_PRIZE_POOL_ALREADY_FUNDED" };
      }
      return { ok: true, value: transferPlan(pool, "strk20_shield", actorAddress) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async prepareSettlement(input: { projectId: string; seasonId: string; actorWalletAddress: string }): Promise<ArenaPrizePoolResult<ArenaPrizePoolView>> {
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      if (!pool) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
      if (fingerprintWallet(input.actorWalletAddress, this.walletHashPepper) !== pool.sponsorFingerprint) {
        return { ok: false, code: "ARENA_SPONSOR_WALLET_REQUIRED" };
      }
      if (pool.status === "settled") return { ok: false, code: "ARENA_PRIZE_POOL_ALREADY_SETTLED" };
      if (pool.status !== "funded") return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FUNDED" };
      const scheduled = await this.repositories.listArenaScheduledMatches(input.projectId, input.seasonId);
      if (scheduled.length === 0 || scheduled.some((match) => match.status !== "completed" || !match.matchId)) return { ok: false, code: "ARENA_MATCH_NOT_COMPLETE" };
      const receipts = await Promise.all(scheduled.map((match) => this.repositories.getArenaMatchReceipt(input.projectId, match.matchId!)));
      if (receipts.some((receipt) => !receipt)) return { ok: false, code: "ARENA_MATCH_NOT_COMPLETE" };
      const winner = winnerFromMatches(receipts.map((receipt) => ({ leftAgentId: receipt!.leftAgentId, rightAgentId: receipt!.rightAgentId, publicReceipt: receipt!.publicReceipt })));
      if (!winner.ok) return winner;
      const winnerEntry = await this.repositories.getArenaSeasonEntry(input.projectId, input.seasonId, winner.value);
      if (!winnerEntry?.ownerFingerprint || !winnerEntry.encryptedPayoutWallet) {
        return { ok: false, code: "ARENA_WINNER_PAYOUT_NOT_REGISTERED" };
      }
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const recipient = normalizeFeltAddress(decryptField(
        winnerEntry.encryptedPayoutWallet,
        {
          projectId: input.projectId,
          recordType: "arena_season_entry",
          recordId: winnerEntry.id,
          fieldName: "payout_wallet",
        },
        { dataKey, wrappedKey: project.wrappedDataKey },
      ));
      if (!recipient || fingerprintWallet(recipient, this.walletHashPepper) !== winnerEntry.ownerFingerprint) {
        return { ok: false, code: "ARENA_WINNER_PAYOUT_NOT_REGISTERED" };
      }
      const updatedAt = this.now();
      const next = {
        ...pool,
        status: "settlement_pending" as const,
        winnerAgentId: winner.value,
        recipientFingerprint: fingerprintWallet(recipient, this.walletHashPepper),
        encryptedRecipient: encryptField(recipient, { projectId: input.projectId, recordType: "arena_prize_pool", recordId: pool.id, fieldName: "recipient" }, { dataKey, wrappedKey: project.wrappedDataKey }),
        updatedAt,
      };
      await this.repositories.prepareArenaPrizeSettlement({
        pool: next,
        expectedStatus: "funded",
        audit: {
          id: this.idFactory(),
          projectId: input.projectId,
          actorFingerprint: fingerprintWallet(input.actorWalletAddress, this.walletHashPepper),
          eventType: "arena_prize_settlement_prepared",
          payloadDigest: commitment({ poolId: pool.id, winnerAgentId: winner.value, recipientFingerprint: next.recipientFingerprint }),
          createdAt: updatedAt,
        },
      });
      return { ok: true, value: view(next) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async getSettlementTransactionPlan(input: { projectId: string; seasonId: string; actorWalletAddress: string }): Promise<ArenaPrizePoolResult<ArenaFundingTransactionPlan>> {
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      if (!pool) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
      if (fingerprintWallet(input.actorWalletAddress, this.walletHashPepper) !== pool.sponsorFingerprint) {
        return { ok: false, code: "ARENA_SPONSOR_WALLET_REQUIRED" };
      }
      if (pool.status !== "settlement_pending" || !pool.encryptedRecipient) {
        return { ok: false, code: "ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY" };
      }
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const recipient = normalizeFeltAddress(decryptField(
        pool.encryptedRecipient,
        { projectId: input.projectId, recordType: "arena_prize_pool", recordId: pool.id, fieldName: "recipient" },
        { dataKey, wrappedKey: project.wrappedDataKey },
      ));
      if (!recipient) return { ok: false, code: "ENCRYPTION_FAILED" };
      return { ok: true, value: transferPlan(pool, "strk20_transfer", recipient) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async confirmSettlement(input: {
    projectId: string;
    seasonId: string;
    actorWalletAddress: string;
    confirmation: ArenaTransferConfirmation;
  }): Promise<ArenaPrizePoolResult<ArenaPrizePoolView>> {
    const parsed = arenaTransferConfirmationSchema.safeParse(input.confirmation);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const normalizedTransactionHash = transactionHash(parsed.data.authorization.transactionHash);
    if (!normalizedTransactionHash) return { ok: false, code: "INVALID_INPUT" };
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      if (!pool) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
      const actorAddress = normalizeFeltAddress(input.actorWalletAddress);
      if (!actorAddress || fingerprintWallet(input.actorWalletAddress, this.walletHashPepper) !== pool.sponsorFingerprint) {
        return { ok: false, code: "ARENA_SPONSOR_WALLET_REQUIRED" };
      }
      if (pool.status === "settled") {
        return pool.settlementTransactionHash === normalizedTransactionHash
          ? { ok: true, value: view(pool) }
          : { ok: false, code: "TRANSACTION_ALREADY_USED" };
      }
      const retryingUnknownSettlement = pool.status === "unknown"
        && pool.settlementTransactionHash === normalizedTransactionHash;
      if (pool.status !== "settlement_pending" && !retryingUnknownSettlement) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY" };
      if (!pool.encryptedRecipient) return { ok: false, code: "ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY" };
      const project = await this.repositories.getProject(pool.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, pool.projectId);
      const recipient = normalizeFeltAddress(decryptField(
        pool.encryptedRecipient,
        { projectId: pool.projectId, recordType: "arena_prize_pool", recordId: pool.id, fieldName: "recipient" },
        { dataKey, wrappedKey: project.wrappedDataKey },
      ));
      if (!recipient) return { ok: false, code: "ENCRYPTION_FAILED" };
      const transferAuthorization = await this.verifyTransferAuthorization({
        confirmation: parsed.data,
        expectedPlan: transferPlan(pool, "strk20_transfer", recipient),
        actorWalletAddress: actorAddress,
        transactionHash: normalizedTransactionHash,
      });
      if (!transferAuthorization.ok) return transferAuthorization;
      if (await this.repositories.getArenaPrizeTransaction(normalizedTransactionHash)) {
        return { ok: false, code: "TRANSACTION_ALREADY_USED" };
      }
      const confirmation = await confirmStrk20Transaction(this.receiptProvider, {
        transactionHash: normalizedTransactionHash,
        poolAddress: pool.poolAddress,
      });
      if (confirmation.kind !== "confirmed") {
        const unknown = { ...pool, status: "unknown" as const, settlementTransactionHash: normalizedTransactionHash, updatedAt: this.now() };
        await this.repositories.updateArenaPrizePool(unknown);
        return { ok: false, code: "TRANSACTION_NOT_CONFIRMED" };
      }
      const updatedAt = this.now();
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorizationDigest = commitment(transferAuthorization.value);
      const receiptDigest = commitment({
        chainReceiptDigest: confirmation.receiptDigest,
        authorizationDigest,
      });
      const next = { ...pool, status: "settled" as const, settlementTransactionHash: normalizedTransactionHash, settlementReceiptDigest: receiptDigest, updatedAt };
      await this.repositories.confirmArenaPrizePoolTransaction({
        pool: next,
        expectedStatus: pool.status,
        transaction: {
          transactionHash: normalizedTransactionHash,
          poolId: pool.id,
          projectId: pool.projectId,
          seasonId: pool.seasonId,
          operation: "settlement",
          receiptDigest,
          authorizationDigest,
          encryptedAuthorization: encryptField(
            JSON.stringify(transferAuthorization.value),
            {
              projectId: pool.projectId,
              recordType: "arena_prize_transaction",
              recordId: normalizedTransactionHash,
              fieldName: "authorization",
            },
            { dataKey, wrappedKey: project.wrappedDataKey },
          ),
          createdAt: updatedAt,
        },
        audit: {
          id: this.idFactory(),
          projectId: pool.projectId,
          actorFingerprint,
          eventType: "arena_prize_pool_settled",
          payloadDigest: commitment({ poolId: pool.id, transactionHash: normalizedTransactionHash, receiptDigest, authorizationDigest }),
          createdAt: updatedAt,
        },
      });
      return { ok: true, value: view(next) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async getPool(input: { projectId: string; seasonId: string; actorWalletAddress: string }): Promise<ArenaPrizePoolResult<ArenaPrizePoolView>> {
    const authorized = await this.authorize(input.projectId, input.actorWalletAddress);
    if (!authorized.ok) return authorized;
    try {
      const pool = await this.repositories.getArenaPrizePool(input.projectId, input.seasonId);
      return pool ? { ok: true, value: view(pool) } : { ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async listPublicSettlementReceipts(projectId: string): Promise<ArenaPrizePoolResult<ArenaSettlementReceiptView[]>> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) return { ok: false, code: "INVALID_INPUT" };
    try {
      if (!(await this.repositories.getProject(normalizedProjectId))) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const pools = await this.repositories.listArenaPrizePools(normalizedProjectId);
      return {
        ok: true,
        value: pools
          .filter((pool): pool is ArenaPrizePoolRecord & {
            status: "settled";
            winnerAgentId: string;
            fundingTransactionHash: string;
            settlementTransactionHash: string;
            fundingReceiptDigest: string;
            settlementReceiptDigest: string;
          } => pool.status === "settled"
            && !!pool.winnerAgentId
            && !!pool.fundingTransactionHash
            && !!pool.settlementTransactionHash
            && !!pool.fundingReceiptDigest
            && !!pool.settlementReceiptDigest)
          .reverse()
          .map((pool) => ({
            poolId: pool.id,
            seasonId: pool.seasonId,
            winnerAgentId: pool.winnerAgentId,
            fundingReceiptDigest: pool.fundingReceiptDigest,
            settlementReceiptDigest: pool.settlementReceiptDigest,
            settledAt: pool.updatedAt.toISOString(),
          })),
      };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  private async verifyTransferAuthorization(input: {
    confirmation: ArenaTransferConfirmation;
    expectedPlan: ArenaTransferPlan;
    actorWalletAddress: string;
    transactionHash: string;
  }): Promise<ArenaPrizePoolResult<{
    authorization: ArenaTransferAuthorization;
    signature: string[];
  }>> {
    const { authorization, signature } = input.confirmation;
    const issuedAt = Date.parse(authorization.issuedAt);
    const expiresAt = Date.parse(authorization.expiresAt);
    const now = this.now().getTime();
    if (
      !Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || issuedAt > now + 30_000
      || expiresAt <= now
      || expiresAt <= issuedAt
      || expiresAt - issuedAt > ARENA_TRANSFER_AUTHORIZATION_TTL_MS
    ) {
      return { ok: false, code: "TRANSFER_AUTHORIZATION_EXPIRED" };
    }
    if (
      transactionHash(authorization.transactionHash) !== input.transactionHash
      || !sameTransferPlan(authorization, input.expectedPlan)
    ) {
      return { ok: false, code: "TRANSFER_PLAN_MISMATCH" };
    }
    try {
      const valid = await this.verifySignature(
        buildArenaTransferAuthorizationTypedData(authorization),
        signature,
        validateAndParseAddress(input.actorWalletAddress),
      );
      if (!valid) return { ok: false, code: "SIGNATURE_INVALID" };
    } catch {
      return { ok: false, code: "SIGNATURE_UNAVAILABLE" };
    }
    return { ok: true, value: { authorization, signature } };
  }

  private async authorize(projectId: string, walletAddress: string): Promise<ArenaPrizePoolResult<true>> {
    const project = await this.repositories.getProject(projectId.trim());
    if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
    const result = await authorizeProject(this.repositories, { projectId: projectId.trim(), walletFingerprint: fingerprintWallet(walletAddress, this.walletHashPepper), action: "manage_arena_prize_pool" });
    return result.ok ? { ok: true, value: true } : { ok: false, code: mapAuthorizationCode(result.code) };
  }
}
