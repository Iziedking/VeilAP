export type DomainErrorCode =
  | "AGREEMENT_STALE"
  | "ARTIFACT_TAMPERED"
  | "DUPLICATE_RELEASE"
  | "ILLEGAL_RELEASE_TRANSITION"
  | "RELEASE_AMOUNT_INVALID"
  | "UNRESOLVED_RELEASE";

export type DomainResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DomainErrorCode };

export type AcceptanceCriterion = Readonly<{
  id: string;
  description: string;
}>;

export type AgreementInput = Readonly<{
  schemaVersion: 1;
  chainId: "SN_MAIN";
  projectId: string;
  version: number;
  companyWallet: string;
  contributorWalletHash: string;
  acceptanceCriteria: readonly AcceptanceCriterion[];
  milestoneMinor: string;
  royaltyBps: number;
  expiresAt: string;
}>;

export type AgreementRecord = Readonly<{
  input: AgreementInput;
  acceptanceCriteriaDigest: string;
  digest: string;
}>;

export type CheckpointInput = Readonly<{
  schemaVersion: 1;
  id: string;
  projectId: string;
  agreementVersion: number;
  sequence: number;
  artifactDigest: string;
  submittedByRole: "contributor";
  submittedAt: string;
}>;

export type CheckpointRecord = Readonly<{
  input: CheckpointInput;
  digest: string;
}>;
