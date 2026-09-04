import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ParticipantAgentDraftService } from "./participant-agent-drafts";
const state=vi.hoisted(()=>({wallet:"0x123",service:undefined as ParticipantAgentDraftService|undefined}));
vi.mock("@/server/auth/request-actor",()=>({readRequestActor:async()=>state.wallet ? {ok:true,walletAddress:state.wallet}:{ok:false,code:"AUTH_REQUIRED"}}));
vi.mock("./participant-agent-draft-runtime",()=>({getParticipantAgentDraftService:()=>state.service!}));
import { GET as list, POST as create } from "@/app/api/profile/agent-drafts/route";
import { GET as review, POST as action } from "@/app/api/profile/agent-drafts/[id]/route";
import { POST as upload } from "@/app/api/agent-drafts/upload/route";
const grant="ab".repeat(32);
const pkg={protocolVersion:"veil-agent.v1",engineVersion:"holdem-sealed-v0.3",agentId:"HTTP_BOT",displayName:"HTTP Bot",policy:{rules:[{when:{minHandStrength:4},action:"raise"}],fallbackAction:"fold"}};
const request=(body:unknown,token?:string)=>new Request("https://api.test/api/agent-drafts/upload",{method:"POST",headers:{"Content-Type":"application/json",...(token ? {Authorization:"Bearer "+token}: {})},body:JSON.stringify(body)});
beforeEach(()=>{state.wallet="0x123";state.service=new ParticipantAgentDraftService({repositories:createMemoryRepositories().projects,walletHashPepper:"p".repeat(32),sessionSecret:"s".repeat(32),vaultKeys:{currentKeyId:"test",keys:{test:"ab".repeat(32)}}});});
describe("draft HTTP boundaries",()=>{
  it("lets a grant upload but cannot substitute for owner authentication or review",async()=>{
    const created=await create(request({grant}));expect(created.status).toBe(200);const d=(await created.json()).value;const context={params:Promise.resolve({id:d.id})};
    state.wallet="";
    expect((await upload(request(pkg))).status).toBe(401);
    const uploaded=await upload(request(pkg,grant));expect(uploaded.status).toBe(200);const ready=(await uploaded.json()).value;
    expect(uploaded.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(ready)).not.toMatch(/fallbackAction|ciphertext|ownerFingerprint/);
    expect((await review(request({},grant),context)).status).toBe(401);
    expect((await action(request({action:"save",commitment:ready.agent.artifactCommitment},grant),context)).status).toBe(401);
    expect((await create(request({grant},grant))).status).toBe(401);expect((await list()).status).toBe(401);
    state.wallet="0x999";expect((await review(request({}),context)).status).toBe(404);
    state.wallet="0x123";const saved=await action(request({action:"save",commitment:ready.agent.artifactCommitment}),context);expect(saved.status).toBe(200);expect((await saved.json()).value.status).toBe("saved");
  });
  it("rejects oversized bodies, unknown actions and wrapper packages",async()=>{
    await create(request({grant}));
    expect((await upload(request({agentPackage:pkg},grant))).status).toBe(400);
    expect((await upload(request({extra:"x".repeat(65536)},grant))).status).toBe(413);
    expect((await create(request({grant,owner:"someone-else"}))).status).toBe(400);
    const d=await state.service!.create("0x123",grant);
    expect((await action(request({action:"save",commitment:"x",replace:true}),{params:Promise.resolve({id:d.id})})).status).toBe(400);
  });
});
