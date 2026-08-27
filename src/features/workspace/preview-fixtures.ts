import { digestArtifact } from "@/domain/canonical";
import { createCheckpoint } from "@/domain/checkpoint";
import type { CheckpointRecord } from "@/domain/types";

export type PreviewCheckpoint = Readonly<{
  record: CheckpointRecord;
  title: string;
  note: string;
  artifact: string;
  displayStatus: "invalid" | "ready_for_review";
}>;

const checkpointOneRecordedArtifact = "circuit package revision one";
const checkpointTwoArtifact = "circuit package revision two with deterministic fixtures";

export const previewProject = {
  id: "VAP-0827",
  name: "ZK Compliance Module",
  company: "Northline Protocol Labs",
  agreementVersion: 2,
  agreementDigest: "e9312f49ebb476378a47630eca15c61e4de5e15e18dac1585e1cdd278da1f721",
  milestoneMinor: 47_850_000_000n,
  royaltyBps: 750,
  contributorAddress: "0x071a…d4c9",
  contributorRole: "External cryptographer",
  preparedAt: "2026-08-27T12:30:00.000Z",
  checkpoints: [
    {
      record: createCheckpoint({
        schemaVersion: 1,
        id: "CHK-0001",
        projectId: "VAP-0827",
        agreementVersion: 2,
        sequence: 1,
        artifactDigest: digestArtifact(checkpointOneRecordedArtifact),
        submittedByRole: "contributor",
        submittedAt: "2026-08-26T16:20:00.000Z",
      }),
      title: "Circuit package / revision one",
      note: "Recorded artifact bytes no longer match the submitted digest.",
      artifact: `${checkpointOneRecordedArtifact} changed after submission`,
      displayStatus: "invalid",
    },
    {
      record: createCheckpoint({
        schemaVersion: 1,
        id: "CHK-0002",
        projectId: "VAP-0827",
        agreementVersion: 2,
        sequence: 2,
        artifactDigest: digestArtifact(checkpointTwoArtifact),
        submittedByRole: "contributor",
        submittedAt: "2026-08-27T12:00:00.000Z",
      }),
      title: "Circuit package / revision two",
      note: "Digest and agreement version match. Human acceptance is still required.",
      artifact: checkpointTwoArtifact,
      displayStatus: "ready_for_review",
    },
  ] satisfies readonly PreviewCheckpoint[],
} as const;
