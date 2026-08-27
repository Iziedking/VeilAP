import { commitment, digestArtifact } from "./canonical";
import type {
  CheckpointInput,
  CheckpointRecord,
  DomainResult,
} from "./types";

export function createCheckpoint(input: CheckpointInput): CheckpointRecord {
  return {
    input,
    digest: commitment({
      schemaVersion: input.schemaVersion,
      id: input.id,
      projectId: input.projectId,
      agreementVersion: input.agreementVersion,
      sequence: input.sequence,
      artifactDigest: input.artifactDigest,
      submittedByRole: input.submittedByRole,
      submittedAt: input.submittedAt,
    }),
  };
}

export function verifyCheckpointArtifact(
  checkpoint: CheckpointRecord,
  artifact: string | Uint8Array,
): DomainResult<{ artifactDigest: string }> {
  const artifactDigest = digestArtifact(artifact);
  if (artifactDigest !== checkpoint.input.artifactDigest) {
    return { ok: false, code: "ARTIFACT_TAMPERED" };
  }

  return { ok: true, value: { artifactDigest } };
}
