import { commitment } from "./canonical";
import type {
  AgreementInput,
  AgreementRecord,
  DomainResult,
} from "./types";

export function createAgreement(input: AgreementInput): AgreementRecord {
  const acceptanceCriteriaDigest = commitment(input.acceptanceCriteria);
  const digest = commitment({
    schemaVersion: input.schemaVersion,
    chainId: input.chainId,
    projectId: input.projectId,
    version: input.version,
    companyWallet: input.companyWallet,
    contributorWalletHash: input.contributorWalletHash,
    acceptanceCriteriaDigest,
    milestoneMinor: input.milestoneMinor,
    royaltyBps: input.royaltyBps,
    expiresAt: input.expiresAt,
  });

  return { input, acceptanceCriteriaDigest, digest };
}

export function validateAgreementVersion(
  currentVersion: number,
  decisionVersion: number,
): DomainResult<{ agreementVersion: number }> {
  if (currentVersion !== decisionVersion) {
    return { ok: false, code: "AGREEMENT_STALE" };
  }

  return { ok: true, value: { agreementVersion: currentVersion } };
}
