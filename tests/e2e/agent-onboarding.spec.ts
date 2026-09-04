import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createMemoryRepositories } from "../../src/server/db/repositories";
import { ParticipantAgentDraftService } from "../../src/server/arena/participant-agent-drafts";
import { ParticipantAgentService } from "../../src/server/arena/participant-agent-service";
const pkg={protocolVersion:"veil-agent.v1",engineVersion:"holdem-sealed-v0.3",agentId:"BROWSER_BOT",displayName:"Browser Bot",policy:{rules:[{when:{minHandStrength:4},action:"raise"}],fallbackAction:"fold"}};
const file=(value:unknown=pkg)=>({name:"browser.veil-agent.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(value))});
async function fixture(page:Page) {
  const deps={repositories:createMemoryRepositories().projects,walletHashPepper:"p".repeat(32),sessionSecret:"s".repeat(32),vaultKeys:{currentKeyId:"test",keys:{test:"ab".repeat(32)}}};
  const service=new ParticipantAgentDraftService(deps);const vault=new ParticipantAgentService(deps);
  const state={wallet:"0x123",loseSave:false,entriesFail:false,saveCalls:0};
  // Browser network responses use the real service. Wallet authentication is a fixture;
  // separate HTTP tests prove that a bearer grant cannot authenticate an owner action.
  await page.route("**/api/**",async route=>{
    const req=route.request();const path=new URL(req.url()).pathname;const body=req.method()==="POST" ? req.postDataJSON() : undefined;
    try {
      let value:unknown=null;
      if(path==="/api/auth/session") value=state.wallet ? {walletAddress:state.wallet,xVerification:{configured:false,identity:null}} : null;
      else if(path==="/api/profile/agent-drafts") value=req.method()==="POST" ? await service.create(state.wallet,body.grant,body.targetAgentId) : await service.list(state.wallet);
      else if(path.startsWith("/api/profile/agent-drafts/")) {
        const id=path.split("/").at(-1)!;
        if(body?.action==="save") {value=await service.save(state.wallet,id,body.commitment);state.saveCalls++;if(state.loseSave){state.loseSave=false;return route.abort("failed");}}
        else if(body?.action==="revoke") value=await service.revoke(state.wallet,id);
        else value=await service.review(state.wallet,id);
      } else if(path==="/api/agent-drafts/upload") value=await service.upload(req.headers().authorization.slice(7),body);
      else if(path==="/api/profile/agents") value=await vault.list(state.wallet);
      else if(path.startsWith("/api/profile/agents/")) value=await vault.open({actorWalletAddress:state.wallet,agentId:decodeURIComponent(path.split("/").at(-1)!)});
      else if(path==="/api/profile/entries") {if(state.entriesFail) return route.fulfill({status:503,json:{ok:false,code:"PERSISTENCE_FAILED"}});value=[];}
      else if(path==="/api/competitions") value=[];
      return route.fulfill({json:{ok:true,value}});
    } catch(error) {return route.fulfill({status:409,json:{ok:false,code:error instanceof Error ? error.message : "PERSISTENCE_FAILED"}});}
  });
  return {service,vault,state};
}

test("file upload reviews and saves without an open season or X verification",async({page},info)=>{
  const {vault}=await fixture(page);
  await page.goto("/profile");await page.getByRole("link",{name:"Add agent",exact:false}).click();
  await page.getByRole("button",{name:/Upload file/}).click();
  await page.getByLabel("Choose agent file").setInputFiles(file());
  await expect(page.getByRole("heading",{level:1})).toHaveText("Review your agent.");
  expect(await vault.list("0x123")).toHaveLength(0);
  await expect(page.getByLabel("Agent review")).toContainText("privileged operators");
  await expect(page.getByLabel("Agent review")).not.toContainText("fallbackAction");
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(storage).not.toContain("BROWSER_BOT");
  await page.screenshot({path:info.outputPath("agent-review.png"),fullPage:true});
  const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll("button,a,summary")].filter(e=>(e as HTMLElement).offsetParent!==null && e.getBoundingClientRect().height<44).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height,cls:e.className}))}));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);expect(layout.smallTargets).toEqual([]);
  await page.getByRole("button",{name:"Save agent",exact:true}).click();
  await expect(page.getByRole("heading",{level:1})).toHaveText("Saved to My agents.");
  await page.getByRole("button",{name:"Choose competition",exact:true}).click();
  await expect(page.getByText(/No compatible public competition/)).toBeVisible();
  await page.getByRole("link",{name:"Back to My agents",exact:true}).click();
  await expect(page.locator(".profile-library-row")).toContainText("Browser Bot");expect(await vault.list("0x123")).toHaveLength(1);
});

test("invalid and oversized files never create drafts",async({page})=>{
  const {service}=await fixture(page);await page.goto("/profile/agents/new");await page.getByRole("button",{name:/Upload file/}).click();
  await page.getByLabel("Choose agent file").setInputFiles(file({...pkg,sourceCode:"execute"}));await expect(page.locator("main").getByRole("alert")).toContainText("Check your package");
  await page.getByLabel("Choose agent file").setInputFiles({name:"large.json",mimeType:"application/json",buffer:Buffer.alloc(65537,32)});await expect(page.locator("main").getByRole("alert")).toContainText("64 KB");
  expect(await service.list("0x123")).toHaveLength(0);
  await page.getByLabel("Choose agent file").setInputFiles(file());await expect(page.getByRole("button",{name:"Save agent",exact:true})).toBeVisible();
});

test("coding-agent prompt returns to a recoverable human review",async({page})=>{
  const {service,vault}=await fixture(page);await page.goto("/profile/agents/new");await page.getByRole("button",{name:/Send from coding agent/}).click();
  const prompt=await page.getByLabel("Coding agent prompt").inputValue();const token=/Authorization: Bearer ([a-f0-9]{64})/.exec(prompt)![1];
  expect(prompt).toContain("No open competition is needed");expect(prompt).toContain("Do not save");
  const id=new URL(page.url()).searchParams.get("draft")!;
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain(token);
  await service.upload(token,pkg);await page.reload();
  await expect(page.getByRole("button",{name:"Save agent",exact:true})).toBeVisible();expect(await vault.list("0x123")).toHaveLength(0);
  await page.getByRole("button",{name:"Save agent",exact:true}).click();await expect(page.getByRole("heading",{level:1})).toHaveText("Saved to My agents.");
  expect((await service.review("0x123",id)).status).toBe("saved");
});

test("retry after a lost save response returns the same committed version",async({page})=>{
  const {state,vault}=await fixture(page);state.loseSave=true;
  await page.goto("/profile/agents/new");await page.getByRole("button",{name:/Upload file/}).click();await page.getByLabel("Choose agent file").setInputFiles(file());
  await page.getByRole("button",{name:"Save agent",exact:true}).click();await expect(page.locator("main").getByRole("alert")).toContainText("safe to retry");
  await page.getByRole("button",{name:"Save agent",exact:true}).click();await expect(page.getByRole("heading",{level:1})).toHaveText("Saved to My agents.");
  expect(state.saveCalls).toBe(2);expect((await vault.list("0x123"))[0].version).toBe(1);
});

test("explicit update preserves identity and selection reaches competition entry",async({page})=>{
  const {vault}=await fixture(page);const before=await vault.save({actorWalletAddress:"0x123",agentPackage:pkg});
  await page.goto("/profile");await page.getByRole("link",{name:"Update",exact:true}).click();await page.getByRole("button",{name:/Upload file/}).click();
  await page.getByLabel("Choose agent file").setInputFiles(file({...pkg,displayName:"Improved Bot"}));await page.getByRole("button",{name:"Save update",exact:true}).click();
  await expect(page.getByRole("heading",{level:1})).toHaveText("Saved to My agents.");const after=(await vault.list("0x123"))[0];expect(after.id).toBe(before.id);expect(after.version).toBe(2);
  await page.getByRole("link",{name:"Back to My agents",exact:true}).click();await page.getByRole("link",{name:"Choose competition",exact:true}).click();
  await expect(page.getByText("BROWSER_BOT selected from My agents. Review the competition before approving entry.")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Choose where your agent competes."})).toBeVisible();
  await expect(page.getByPlaceholder("Paste the complete .veil-agent.json package here")).toHaveCount(0);
  await expect(page.getByRole("button",{name:/SAVE AGENT TO PROFILE/})).toHaveCount(0);
});

test("a different account cannot reopen a draft and an unavailable history does not hide the library",async({page})=>{
  const {service,state,vault}=await fixture(page);const token=randomBytes(32).toString("hex");const d=await service.create("0x123",token);await service.upload(token,pkg);
  state.wallet="0x999";await page.goto("/profile/agents/new?draft="+d.id);await expect(page.locator("main").getByRole("alert")).toContainText("unavailable for this account");await expect(page.getByRole("button",{name:"Save agent",exact:true})).toHaveCount(0);
  state.wallet="0x123";state.entriesFail=true;await vault.save({actorWalletAddress:state.wallet,agentPackage:pkg});await page.goto("/profile");await expect(page.locator(".profile-library-row")).toContainText("Browser Bot");await expect(page.locator("main").getByRole("alert")).toContainText("Competition history could not be loaded");
});

test("signed out visitors cannot create an upload permission",async({page})=>{
  const {state,service}=await fixture(page);state.wallet="";await page.goto("/profile/agents/new");await expect(page.getByRole("heading",{name:"Sign in to add an agent"})).toBeVisible();await expect(page.getByRole("button",{name:/Send from coding agent/})).toHaveCount(0);expect(await service.list("0x123")).toHaveLength(0);
});
