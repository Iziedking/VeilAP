import type { EncryptedField } from "@/server/crypto/envelope";
import type { ParticipantAgentView } from "./participant-agent-service";
import type { ParticipantAgentPackageRecord } from "@/server/db/repositories";

export interface AgentDraftRecord {
  id: string;
  ownerFingerprint: string;
  status: "pending" | "ready" | "saved" | "revoked";
  targetAgentId: string | null;
  baseVersion: number | null;
  baseCommitment: string | null;
  agent: ParticipantAgentView | null;
  encryptedPackage: (EncryptedField & { keyId: string }) | null;
  createdAt: Date;
  expiresAt: Date;
}
export type DraftMutation = (draft: AgentDraftRecord, existing: ParticipantAgentPackageRecord | undefined) => { draft: AgentDraftRecord; agent?: ParticipantAgentPackageRecord };
export type AgentDraftView = { id: string; status: AgentDraftRecord["status"] | "expired"; targetAgentId: string | null; agent: ParticipantAgentView | null; createdAt: string; expiresAt: string };
