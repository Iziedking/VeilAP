import { confirmStrk20Transaction, type ReceiptTraceProvider } from "@/lib/strk20/receipt";
import type { ProjectRepository, ReleaseRecord } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import type { ReleaseServiceResult, ReleaseView } from "./release-service";

export interface ReconciliationServiceDependencies {
  repositories: ProjectRepository;
  receiptProvider: ReceiptTraceProvider;
  walletHashPepper: string;
  poolAddress: string;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class ReconciliationService {
  private readonly repositories: ProjectRepository;
  private readonly receiptProvider: ReceiptTraceProvider;
  private readonly walletHashPepper: string;
  private readonly poolAddress: string;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(dependencies: ReconciliationServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.receiptProvider = dependencies.receiptProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.poolAddress = dependencies.poolAddress;
    this.now = dependencies.now ?? (() => new Date());
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async reconcile(input: { releaseId: string; actorWalletAddress: string }): Promise<ReleaseServiceResult<ReleaseView>> {
    const release = await this.repositories.getRelease(input.releaseId);
    if (!release) return { ok: false, code: "RELEASE_NOT_FOUND" };
    const project = await this.repositories.getProject(release.projectId);
    if (!project || project.ownerFingerprint !== fingerprintWallet(input.actorWalletAddress, this.walletHashPepper)) {
      return { ok: false, code: "WALLET_FORBIDDEN" };
    }
    const operation = await this.repositories.getChainOperation(release.id);
    if (!operation) return { ok: false, code: "PERSISTENCE_FAILED" };
    if (release.status === "confirmed" || release.status === "reverted") {
      return { ok: true, value: await this.view(release) };
    }
    if (release.status !== "submitted" && release.status !== "unknown") {
      return { ok: false, code: "RELEASE_NOT_READY" };
    }
    if (!operation.transactionHash) {
      return { ok: false, code: "RECONCILIATION_PENDING" };
    }

    const outcome = await confirmStrk20Transaction(
      this.receiptProvider,
      { transactionHash: operation.transactionHash, poolAddress: this.poolAddress },
      { sleep: this.sleep },
    );
    if (outcome.kind === "confirmed") {
      const next = { ...release, status: "confirmed" as const };
      await this.repositories.updateRelease(next);
      await this.repositories.updateChainOperation({
        ...operation,
        status: "confirmed",
        receiptDigest: outcome.receiptDigest,
        reason: undefined,
        updatedAt: this.now(),
      });
      return { ok: true, value: await this.view(next) };
    }
    if (outcome.kind === "reverted") {
      const next = { ...release, status: "reverted" as const };
      await this.repositories.updateRelease(next);
      await this.repositories.updateChainOperation({
        ...operation,
        status: "reverted",
        reason: outcome.reason,
        updatedAt: this.now(),
      });
      return { ok: true, value: await this.view(next) };
    }
    const next = { ...release, status: "unknown" as const };
    await this.repositories.updateRelease(next);
    await this.repositories.updateChainOperation({
      ...operation,
      status: "unknown",
      reason: outcome.kind === "unknown" ? outcome.reason : "RECONCILIATION_INCOMPLETE",
      updatedAt: this.now(),
    });
    return { ok: true, value: await this.view(next) };
  }

  private async view(release: ReleaseRecord): Promise<ReleaseView> {
    const operation = await this.repositories.getChainOperation(release.id);
    return {
      id: release.id,
      projectId: release.projectId,
      kind: release.kind,
      sourceId: release.sourceId,
      decisionId: release.decisionId,
      amountMinor: release.amountMinor,
      status: release.status,
      transactionHash: operation?.transactionHash,
      receiptDigest: operation?.receiptDigest,
      reason: operation?.reason,
      createdAt: release.createdAt.toISOString(),
    };
  }
}
