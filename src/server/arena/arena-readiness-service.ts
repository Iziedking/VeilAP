import type { VeilapServerConfig } from "@/server/env";
import { normalizeFeltAddress } from "@/lib/strk20/address";

export type ArenaReadinessReport = {
  ready: boolean;
  mode: VeilapServerConfig["mode"];
  checks: {
    database: boolean;
    arenaSchema: boolean;
    kms: boolean;
    receiptSigning: boolean;
    pool: boolean;
    worker: boolean;
    xVerification: boolean;
  };
  blockers: string[];
};

export interface ArenaReadinessServiceDependencies {
  config: VeilapServerConfig;
  poolAddress?: string;
  checkDatabase: () => Promise<{ database: boolean; arenaSchema: boolean }>;
  checkKms: () => Promise<boolean>;
  checkReceiptSigning: () => boolean;
}

export class ArenaReadinessService {
  private readonly config: VeilapServerConfig;
  private readonly poolAddress?: string;
  private readonly checkDatabase: ArenaReadinessServiceDependencies["checkDatabase"];
  private readonly checkKms: ArenaReadinessServiceDependencies["checkKms"];
  private readonly checkReceiptSigning: ArenaReadinessServiceDependencies["checkReceiptSigning"];

  constructor(dependencies: ArenaReadinessServiceDependencies) {
    this.config = dependencies.config;
    this.poolAddress = dependencies.poolAddress;
    this.checkDatabase = dependencies.checkDatabase;
    this.checkKms = dependencies.checkKms;
    this.checkReceiptSigning = dependencies.checkReceiptSigning;
  }

  async check(): Promise<ArenaReadinessReport> {
    const [database, kms] = await Promise.all([
      this.checkDatabase(),
      this.checkKms().catch(() => false),
    ]);
    let receiptSigning = false;
    try {
      receiptSigning = this.checkReceiptSigning();
    } catch {
      receiptSigning = false;
    }
    const checks = {
      database: database.database,
      arenaSchema: database.arenaSchema,
      kms,
      receiptSigning,
      pool: Boolean(this.poolAddress && normalizeFeltAddress(this.poolAddress)),
      worker: Boolean(
        this.config.arenaWorkerSecret
        && this.config.arenaWorkerSecret.length >= 64
        && this.config.arenaWorkerWalletAddress
        && normalizeFeltAddress(this.config.arenaWorkerWalletAddress)
      ),
      xVerification: Boolean(
        this.config.xOAuthClientId?.trim()
        && this.config.xOAuthClientSecret?.trim()
        && this.config.xOAuthRedirectUri === "https://api.veilap.xyz/api/auth/x/callback"
      ),
    };
    const blockers: string[] = [];
    if (this.config.mode !== "persisted") blockers.push("PERSISTED_MODE_REQUIRED");
    if (!checks.database) blockers.push("DATABASE_UNAVAILABLE");
    if (!checks.arenaSchema) blockers.push("ARENA_SCHEMA_INCOMPLETE");
    if (!checks.kms) blockers.push("KMS_NOT_READY");
    if (!checks.receiptSigning) blockers.push("RECEIPT_SIGNING_NOT_READY");
    if (!checks.pool) blockers.push("STRK20_POOL_NOT_CONFIGURED");
    if (!checks.worker) blockers.push("ARENA_WORKER_NOT_CONFIGURED");
    if (!checks.xVerification) blockers.push("X_VERIFICATION_NOT_CONFIGURED");
    return { ready: blockers.length === 0, mode: this.config.mode, checks, blockers };
  }
}
