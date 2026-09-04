import { createHash } from "node:crypto";
import { agentPackageCommitment, parseAgentPackage } from "@/domain/arena/strategy-policy";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { ParticipantAgentService, participantAgentView } from "./participant-agent-service";
import type { AgentDraftRecord, AgentDraftView } from "./participant-agent-draft-record";

type Dependencies = ConstructorParameters<typeof ParticipantAgentService>[0];
function grantId(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("DRAFT_GRANT_INVALID");
  return createHash("sha256").update("veil-agent-upload:v1:").update(token).digest("hex");
}
const context = (id: string) => ({ projectId: "participant-agent-vault", recordType: "participant_agent_draft", recordId: id, fieldName: "package" });

export class ParticipantAgentDraftService {
  private readonly vault: ParticipantAgentService;
  constructor(private readonly deps: Dependencies) { this.vault = new ParticipantAgentService(deps); }
  private now() { return this.deps.now?.() ?? new Date(); }
  private owner(wallet: string) { return fingerprintWallet(wallet,this.deps.walletHashPepper); }
  private view(d: AgentDraftRecord): AgentDraftView {
    const expired = d.expiresAt <= this.now() && d.status !== "saved" && d.status !== "revoked";
    return { id:d.id,status:expired ? "expired" : d.status,targetAgentId:d.targetAgentId,agent:expired ? null : d.agent,createdAt:d.createdAt.toISOString(),expiresAt:d.expiresAt.toISOString() };
  }
  private active(d: AgentDraftRecord) {
    if (d.status === "revoked") throw new Error("DRAFT_REVOKED");
    if (d.expiresAt <= this.now()) throw new Error("DRAFT_EXPIRED");
  }
  async create(wallet: string, token: string, targetAgentId?: string): Promise<AgentDraftView> {
    const id = grantId(token); const owner = this.owner(wallet);
    const target = targetAgentId?.trim().toUpperCase() ?? null;
    if (target && !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(target)) throw new Error("DRAFT_AGENT_MISMATCH");
    const existing = target ? await this.deps.repositories.getParticipantAgentPackage(owner,target) : undefined;
    if (target && !existing) throw new Error("DRAFT_NOT_FOUND");
    const now = this.now();
    const record = await this.deps.repositories.createParticipantAgentDraft({ id,ownerFingerprint:owner,status:"pending",targetAgentId:target,baseVersion:existing?.version ?? null,baseCommitment:existing?.artifactCommitment ?? null,agent:null,encryptedPackage:null,createdAt:now,expiresAt:new Date(now.getTime()+3_600_000) });
    return this.view(record);
  }
  async list(wallet: string): Promise<AgentDraftView[]> {
    return (await this.deps.repositories.listParticipantAgentDrafts(this.owner(wallet))).map(d=>this.view(d));
  }
  async review(wallet: string, id: string): Promise<AgentDraftView> {
    const draft = (await this.list(wallet)).find(d=>d.id===id);
    if (!draft) throw new Error("DRAFT_NOT_FOUND");
    return draft;
  }
  async upload(token: string, input: unknown): Promise<AgentDraftView> {
    const id = grantId(token);
    const pkg = parseAgentPackage(input);
    if (Buffer.byteLength(JSON.stringify(input),'utf8') > 64*1024) throw new Error("AGENT_PACKAGE_INVALID");
    const commitment = agentPackageCommitment(pkg);
    const result = await this.deps.repositories.mutateParticipantAgentDraft(id,null,(draft)=>{
      this.active(draft);
      if (draft.agent) {
        if (draft.agent.artifactCommitment !== commitment) throw new Error("DRAFT_UPLOAD_CONFLICT");
        return { draft };
      }
      if (draft.targetAgentId && draft.targetAgentId !== pkg.agentId) throw new Error("DRAFT_AGENT_MISMATCH");
      const ring = this.deps.vaultKeys; const key = ring?.keys[ring.currentKeyId];
      if (!ring || !key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("PARTICIPANT_VAULT_KEY_REQUIRED");
      const agent = { id:draft.id,agentId:pkg.agentId,displayName:pkg.displayName,protocolVersion:pkg.protocolVersion,engineVersion:pkg.engineVersion,ruleCount:pkg.policy.rules.length,artifactCommitment:commitment,version:(draft.baseVersion??0)+1,createdAt:draft.createdAt.toISOString(),updatedAt:this.now().toISOString() };
      return { draft:{...draft,status:"ready",agent,encryptedPackage:{...encryptField(JSON.stringify(pkg),context(id),Buffer.from(key,"hex")),keyId:ring.currentKeyId}} };
    });
    return this.view(result);
  }
  async save(wallet: string,id: string,reviewedCommitment: string): Promise<AgentDraftView> {
    const result = await this.deps.repositories.mutateParticipantAgentDraft(id,this.owner(wallet),(draft,existing)=>{
      if (draft.status !== "saved") this.active(draft);
      if (draft.agent?.artifactCommitment !== reviewedCommitment) throw new Error("DRAFT_REVIEW_CHANGED");
      if (draft.status === "saved") return {draft};
      this.active(draft);
      if (draft.status !== "ready" || !draft.encryptedPackage) throw new Error("DRAFT_NOT_READY");
      if (!draft.targetAgentId && existing) throw new Error("DRAFT_UPDATE_REQUIRED");
      if (draft.targetAgentId && (!existing || existing.version !== draft.baseVersion || existing.artifactCommitment !== draft.baseCommitment)) throw new Error("DRAFT_VERSION_CONFLICT");
      const key = this.deps.vaultKeys?.keys[draft.encryptedPackage.keyId];
      if (!key) throw new Error("DRAFT_KEY_UNAVAILABLE");
      const pkg = parseAgentPackage(JSON.parse(decryptField(draft.encryptedPackage,context(id),Buffer.from(key,"hex"))));
      if (agentPackageCommitment(pkg) !== reviewedCommitment) throw new Error("DRAFT_REVIEW_CHANGED");
      const agent = this.vault.buildRecord(draft.ownerFingerprint,pkg,existing);
      return { agent,draft:{...draft,status:"saved",encryptedPackage:null,agent:participantAgentView(agent)} };
    });
    return this.view(result);
  }
  async revoke(wallet: string,id: string): Promise<AgentDraftView> {
    const result = await this.deps.repositories.mutateParticipantAgentDraft(id,this.owner(wallet),draft=>({draft:draft.status === "saved" ? draft : {...draft,status:"revoked",encryptedPackage:null,agent:null}}));
    return this.view(result);
  }
}
