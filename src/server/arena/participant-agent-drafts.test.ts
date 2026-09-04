import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories, createPostgresRepositories } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { getDatabase } from "@/server/db/client";
import { ParticipantAgentService } from "./participant-agent-service";
import { ParticipantAgentDraftService } from "./participant-agent-drafts";

const PACKAGE = { protocolVersion: "veil-agent.v1", engineVersion: "holdem-sealed-v0.3", agentId: "UPLOAD_BOT", displayName: "Upload Bot", policy: { rules: [{ when: { minHandStrength: 4 }, action: "raise" }], fallbackAction: "fold" } };
const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && (!['127.0.0.1', 'localhost'].includes(new URL(databaseUrl).hostname) || new URL(databaseUrl).pathname !== '/veil_promise_audit')) throw Error('DISPOSABLE_DATABASE_REQUIRED');
for (const backend of ['memory', ...(databaseUrl ? ['postgres'] : [])]) describe('agent drafts: ' + backend, () => {
  function setup() {
    const repositories = backend === 'memory' ? createMemoryRepositories().projects : createPostgresRepositories(getDatabase(databaseUrl)).projects;
    const owner = '0x' + randomBytes(16).toString('hex');
    let now = new Date();
    const deps = { repositories, walletHashPepper: 'p'.repeat(32), sessionSecret: 's'.repeat(32), vaultKeys: { currentKeyId: 'old', keys: { old: 'ab'.repeat(32) } }, now: () => now };
    const service = new ParticipantAgentDraftService(deps);
    return { service, deps, owner, vault: new ParticipantAgentService(deps), token: () => randomBytes(32).toString('hex'), advance: () => { now = new Date(now.getTime() + 3_600_001); } };
  }
  it('requires human save, hides plaintext, isolates owners and atomically handles concurrent retries', async () => {
    const {service, owner, token, vault} = setup(); const grant = token();
    const draft = await service.create(owner, grant);
    expect(await service.create(owner, grant)).toEqual(draft);
    const uploads = await Promise.all(Array.from({length: 4}, () => service.upload(grant, PACKAGE)));
    expect(uploads.every(x => x.status === 'ready')).toBe(true);
    expect(await vault.list(owner)).toHaveLength(0);
    expect(JSON.stringify(await service.review(owner, draft.id))).not.toMatch(/fallbackAction|ciphertext|ownerFingerprint/);
    await expect(service.review('0x999', draft.id)).rejects.toThrow('DRAFT_NOT_FOUND');
    await expect(service.save('0x999', draft.id, uploads[0].agent!.artifactCommitment)).rejects.toThrow('DRAFT_NOT_FOUND');
    await expect(service.upload(token(), PACKAGE)).rejects.toThrow('DRAFT_NOT_FOUND');
    await expect(service.upload(grant, {...PACKAGE, displayName:'Changed'})).rejects.toThrow('DRAFT_UPLOAD_CONFLICT');
    await expect(service.save(owner, draft.id, 'wrong')).rejects.toThrow('DRAFT_REVIEW_CHANGED');
    const saved = await Promise.all(Array.from({length:4}, () => service.save(owner, draft.id, uploads[0].agent!.artifactCommitment)));
    expect(saved.every(x => x.agent!.version === 1 && x.status === 'saved')).toBe(true);
    expect((await vault.list(owner))).toHaveLength(1);
    expect((await vault.open({actorWalletAddress:owner, agentId:PACKAGE.agentId}))?.agentPackage).toEqual(PACKAGE);
    expect(await service.review(owner, draft.id)).toEqual(saved[0]);
  });
  it('refuses expired, revoked and invalid uploads without changing the vault', async () => {
    const {service, owner, token, advance, vault} = setup(); const grant = token();
    const draft = await service.create(owner,grant);
    await expect(service.upload(grant,{...PACKAGE, code:'execute'})).rejects.toThrow('AGENT_PACKAGE_INVALID');
    expect((await service.review(owner,draft.id)).status).toBe('pending');
    await service.revoke(owner,draft.id);
    await expect(service.upload(grant,PACKAGE)).rejects.toThrow('DRAFT_REVOKED');
    const next = token(); const expired = await service.create(owner,next); await service.upload(next,PACKAGE); advance();
    expect((await service.review(owner,expired.id)).status).toBe('expired');
    await expect(service.save(owner,expired.id,'x')).rejects.toThrow('DRAFT_EXPIRED');
    await expect(service.upload(next,PACKAGE)).rejects.toThrow('DRAFT_EXPIRED');
    expect(await vault.list(owner)).toHaveLength(0);
  });
  it('requires explicit updates and rejects stale concurrent updates while preserving stable identity', async () => {
    const {service, owner, token, vault} = setup();
    const original = await vault.save({actorWalletAddress:owner,agentPackage:PACKAGE});
    const grant=token(); const draft=await service.create(owner,grant); const ready=await service.upload(grant,PACKAGE);
    await expect(service.save(owner,draft.id,ready.agent!.artifactCommitment)).rejects.toThrow('DRAFT_UPDATE_REQUIRED');
    const grants=[token(),token()]; const drafts=await Promise.all(grants.map(g=>service.create(owner,g,PACKAGE.agentId)));
    const reviews=await Promise.all(grants.map((g,i)=>service.upload(g,{...PACKAGE,displayName:'Update '+i})));
    const outcomes=await Promise.allSettled(drafts.map((d,i)=>service.save(owner,d.id,reviews[i].agent!.artifactCommitment)));
    expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
    const current=(await vault.list(owner))[0]; expect(current.id).toBe(original.id); expect(current.version).toBe(2);
    const wrong=token(); await service.create(owner,wrong,PACKAGE.agentId);
    await expect(service.upload(wrong,{...PACKAGE,agentId:'OTHER_BOT'})).rejects.toThrow('DRAFT_AGENT_MISMATCH');
  });
  it('supports vault rotation between upload and finalization and fails closed on missing retained key', async () => {
    const {service, owner, token, deps} = setup(); const grant=token(); const d=await service.create(owner,grant); const r=await service.upload(grant,PACKAGE);
    const rotated={...deps,sessionSecret:'z'.repeat(32),vaultKeys:{currentKeyId:'new',keys:{old:'ab'.repeat(32),new:'cd'.repeat(32)}}};
    const missing=new ParticipantAgentDraftService({...rotated,vaultKeys:{currentKeyId:'new',keys:{new:'cd'.repeat(32)}}});
    await expect(missing.save(owner,d.id,r.agent!.artifactCommitment)).rejects.toThrow('DRAFT_KEY_UNAVAILABLE');
    expect((await service.review(owner,d.id)).status).toBe('ready');
    await new ParticipantAgentDraftService(rotated).save(owner,d.id,r.agent!.artifactCommitment);
    expect((await new ParticipantAgentService({...rotated,vaultKeys:{currentKeyId:'new',keys:{new:'cd'.repeat(32)}}}).open({actorWalletAddress:owner,agentId:PACKAGE.agentId}))?.agentPackage).toEqual(PACKAGE);
  });
  it('enforces the active grant limit under concurrent creation', async () => {
    const {service, owner, token}=setup();
    const results=await Promise.allSettled(Array.from({length:8},()=>service.create(owner,token())));
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(5);
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(3);
  });
  it('clears ciphertext on save and revoke and enforces the rolling creation cap', async () => {
    const {service,owner,token,deps}=setup();
    const fingerprint=fingerprintWallet(owner,deps.walletHashPepper);
    const first=token();const d=await service.create(owner,first);const r=await service.upload(first,PACKAGE);
    const record=(await deps.repositories.listParticipantAgentDrafts(fingerprint))[0];
    expect(record.encryptedPackage?.keyId).toBe('old');expect(JSON.stringify(record)).not.toContain('fallbackAction');
    await service.save(owner,d.id,r.agent!.artifactCommitment);
    expect((await deps.repositories.listParticipantAgentDrafts(fingerprint))[0].encryptedPackage).toBeNull();
    for(let i=1;i<20;i++){const t=token();const draft=await service.create(owner,t);await service.upload(t,{...PACKAGE,agentId:'BOT_'+i});await service.revoke(owner,draft.id);}
    expect((await deps.repositories.listParticipantAgentDrafts(fingerprint)).every(x=>x.encryptedPackage===null)).toBe(true);
    await expect(service.create(owner,token())).rejects.toThrow('DRAFT_LIMIT_REACHED');
  });
  it('retains the original update snapshot when creation is retried after the agent changes',async()=>{
    const {service,owner,token,vault}=setup();await vault.save({actorWalletAddress:owner,agentPackage:PACKAGE});
    const t=token();const d=await service.create(owner,t,PACKAGE.agentId);
    await vault.save({actorWalletAddress:owner,agentPackage:{...PACKAGE,displayName:'Changed elsewhere'}});
    expect(await service.create(owner,t,PACKAGE.agentId)).toEqual(d);
    const r=await service.upload(t,{...PACKAGE,displayName:'Stale update'});
    await expect(service.save(owner,d.id,r.agent!.artifactCommitment)).rejects.toThrow('DRAFT_VERSION_CONFLICT');
  });
  if(backend==='postgres') it('rolls back the library insert when the later draft write fails',async()=>{
    const {service,owner,token,vault,deps}=setup();const t=token();const d=await service.create(owner,t);await service.upload(t,PACKAGE);
    const fingerprint=fingerprintWallet(owner,deps.walletHashPepper);
    // Deliberately violate the draft ciphertext/status CHECK after inserting the agent.
    // PostgreSQL must roll back both writes, leaving a ready draft and an empty library.
    await expect(deps.repositories.mutateParticipantAgentDraft(d.id,fingerprint,(draft,existing)=>({agent:vault.buildRecord(fingerprint,PACKAGE as Parameters<typeof vault.buildRecord>[1],existing),draft:{...draft,status:'saved'}}))).rejects.toThrow();
    expect(await vault.list(owner)).toHaveLength(0);expect((await service.review(owner,d.id)).status).toBe('ready');
  });

});
