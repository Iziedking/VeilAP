import { describe, expect, it } from "vitest";

import { authorizeCheckpoint, authorizeProject } from "./authorize";
import type { CheckpointRecord, ProjectRole } from "@/server/db/repositories";

function repositoryFor(roles: ProjectRole[]) {
  return {
    async getMemberRoles() {
      return roles;
    },
  };
}

const checkpoint: CheckpointRecord = {
  id: "checkpoint-1",
  projectId: "project-1",
  agreementVersionId: "agreement-1",
  sequence: 1,
  encryptedPayload: {
    artifact: { version: 1, algorithm: "AES-256-GCM", iv: "iv", ciphertext: "cipher", authTag: "tag" },
    metadata: { version: 1, algorithm: "AES-256-GCM", iv: "iv", ciphertext: "cipher", authTag: "tag" },
  },
  payloadDigest: "digest",
  status: "submitted",
  createdBy: "contributor-fp",
  assignedReviewerFingerprint: "reviewer-fp",
  createdAt: new Date("2026-08-28T10:00:00.000Z"),
};

describe("project authorization", () => {
  it("allows a company to create and version agreements", async () => {
    await expect(authorizeProject(repositoryFor(["company"]), {
      projectId: "project-1",
      walletFingerprint: "company-fp",
      action: "create_agreement",
    })).resolves.toMatchObject({ ok: true });
  });

  it("allows an invited contributor to read the project", async () => {
    await expect(authorizeProject(repositoryFor(["contributor"]), {
      projectId: "project-1",
      walletFingerprint: "contributor-fp",
      action: "read_project",
    })).resolves.toMatchObject({ ok: true });
  });

  it("refuses an auditor evidence access path", async () => {
    await expect(authorizeCheckpoint(repositoryFor(["auditor"]), {
      checkpoint,
      walletFingerprint: "auditor-fp",
    })).resolves.toMatchObject({ ok: true, canReadEvidence: false });
  });

  it("limits reviewers to their assigned checkpoint", async () => {
    await expect(authorizeCheckpoint(repositoryFor(["reviewer"]), {
      checkpoint,
      walletFingerprint: "other-reviewer-fp",
    })).resolves.toEqual({ ok: false, code: "CHECKPOINT_NOT_ASSIGNED" });
  });
});
