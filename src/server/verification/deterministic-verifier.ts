import type {
  DeterministicVerificationCode,
  DeterministicVerificationInput,
} from "./types";

export interface DeterministicVerificationResult {
  code: DeterministicVerificationCode;
  digestMatches: boolean;
  agreementMatches: boolean;
  scopeAccepted: boolean;
}

// This pure core has a second consumer in VerificationService. It deliberately
// sees digests and bounded metadata only, so a future verifier can rebuild the
// decision without access to decrypted evidence or network services.
export function verifyDeterministically(
  input: DeterministicVerificationInput,
): DeterministicVerificationResult {
  const digestMatches =
    input.expectedArtifactDigest === input.storedArtifactDigest &&
    input.storedArtifactDigest === input.computedArtifactDigest;
  const agreementMatches =
    input.expectedAgreementVersion === input.actualAgreementVersion &&
    input.expectedAgreementDigest === input.actualAgreementDigest;
  const scopeAccepted =
    input.expectedProjectId === input.actualProjectId &&
    agreementMatches &&
    digestMatches &&
    input.mediaType === "application/zip" &&
    input.byteLength > 0 &&
    input.byteLength <= input.maxArtifactBytes;

  let code: DeterministicVerificationCode = "VERIFIED";
  if (input.expectedProjectId !== input.actualProjectId) {
    code = "PROJECT_MISMATCH";
  } else if (input.expectedAgreementVersion !== input.actualAgreementVersion) {
    code = "AGREEMENT_STALE";
  } else if (input.expectedAgreementDigest !== input.actualAgreementDigest) {
    code = "AGREEMENT_DIGEST_MISMATCH";
  } else if (input.mediaType !== "application/zip") {
    code = "MEDIA_TYPE_UNSUPPORTED";
  } else if (input.byteLength > input.maxArtifactBytes) {
    code = "ARTIFACT_TOO_LARGE";
  } else if (input.byteLength <= 0) {
    code = "ARTIFACT_ENCODING_INVALID";
  } else if (!digestMatches) {
    code = "ARTIFACT_TAMPERED";
  } else if (!scopeAccepted) {
    code = "ARTIFACT_ENCODING_INVALID";
  }

  return { code, digestMatches, agreementMatches, scopeAccepted };
}
