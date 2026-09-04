"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaNav } from "@/components/arena/arena-nav";
import type { AgentDraftView } from "@/server/arena/participant-agent-draft-record";
import type { CompetitionSummary } from "@/components/arena/arena-types";
import { agentPackageSchema } from "@/domain/arena/strategy-policy";
import { apiFetch, apiUrl } from "@/lib/api/client";
import { onboardingError, onboardingRequest } from "@/lib/api/agent-onboarding";

type Session={walletAddress:string}|null;
function freshGrant() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join(""); }

export function AgentOnboarding({initialDraftId,targetAgentId}:{initialDraftId:string;targetAgentId:string}) {
  const [session,setSession]=useState<Session>(null);
  const [checking,setChecking]=useState(true);
  const [draft,setDraft]=useState<AgentDraftView|null>(null);
  const [mode,setMode]=useState<"choose"|"file"|"coding">("choose");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [filename,setFilename]=useState("");
  const [text,setText]=useState("");
  const [prompt,setPrompt]=useState("");
  const [competitions,setCompetitions]=useState<CompetitionSummary[]|null>(null);
  const [competitionError,setCompetitionError]=useState(false);
  const [choosing,setChoosing]=useState(false);
  const [clock,setClock]=useState(()=>Date.now());
  const grant=useRef("");
  const draftId=useRef(initialDraftId);
  const wallet=useRef("");
  const lock=useRef(false);
  const mounted=useRef(true);
  const refreshVersion=useRef(0);
  const actionController=useRef<AbortController|null>(null);

  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(lock.current) return;
    const version=++refreshVersion.current;
    try {
      const current=await onboardingRequest<Session>("/api/auth/session",undefined,signal);
      if(signal?.aborted || !mounted.current || version !== refreshVersion.current) return;
      if(wallet.current && wallet.current !== current?.walletAddress) {
        grant.current=""; setPrompt(""); setText(""); setDraft(null); actionController.current?.abort();
      }
      wallet.current=current?.walletAddress ?? ""; setSession(current);
      if(current && draftId.current) {
        const value=await onboardingRequest<AgentDraftView>("/api/profile/agent-drafts/"+encodeURIComponent(draftId.current),undefined,signal);
        if(!signal?.aborted && mounted.current && version === refreshVersion.current) {setDraft(value);setError("");}
      }
    } catch(e) { if(!signal?.aborted && mounted.current && version === refreshVersion.current) setError(onboardingError(e)); }
    finally { if(!signal?.aborted && mounted.current && version === refreshVersion.current) setChecking(false); }
  },[]);
  useEffect(()=>{
    mounted.current=true;
    const controller=new AbortController();
    const initialTimer=window.setTimeout(()=>void refresh(controller.signal),0);
    const focus=()=>void refresh(controller.signal);
    window.addEventListener("focus",focus); window.addEventListener("online",focus);
    return ()=>{window.clearTimeout(initialTimer);mounted.current=false;controller.abort();actionController.current?.abort();window.removeEventListener("focus",focus);window.removeEventListener("online",focus);};
  },[refresh]);
  useEffect(()=>{
    if(draft?.status !== "pending") return;
    const controller=new AbortController();
    const timer=window.setInterval(()=>{if(!document.hidden && !lock.current) void refresh(controller.signal);},5000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[draft?.status,refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return ()=>window.clearInterval(timer);},[]);

  async function run(action:(signal:AbortSignal)=>Promise<void>) {
    if(lock.current) return;
    lock.current=true;refreshVersion.current++;setBusy(true);setError("");setNotice("");
    const controller=new AbortController();actionController.current=controller;
    try {await action(controller.signal);} catch(e) {if(mounted.current)setError(onboardingError(e));}
    finally {lock.current=false;if(mounted.current)setBusy(false);}
  }
  async function ensureDraft(signal:AbortSignal) {
    if(!grant.current) grant.current=freshGrant();
    if(draft && draft.id === draftId.current) return draft;
    const value=await onboardingRequest<AgentDraftView>("/api/profile/agent-drafts",{grant:grant.current,...(targetAgentId ? {targetAgentId} : {})},signal);
    draftId.current=value.id;setDraft(value);
    window.history.replaceState(null,"","/profile/agents/new?draft="+encodeURIComponent(value.id));
    return value;
  }
  async function upload(raw:string,signal:AbortSignal) {
    if(new TextEncoder().encode(raw).byteLength > 64*1024) {setError("The file exceeds the 64 KB limit.");return;}
    let input:unknown;
    try {input=JSON.parse(raw);} catch {setError("The file is not valid JSON. Ask your coding agent to check its syntax.");return;}
    const parsed=agentPackageSchema.safeParse(input);
    if(!parsed.success) {setError("Check your package: "+parsed.error.issues.slice(0,3).map(i=>i.path.join(".")+": "+i.message).join("; "));return;}
    await ensureDraft(signal);
    const timeout=window.setTimeout(()=>actionController.current?.abort(),20_000);
    try {
    const response=await apiFetch("/api/agent-drafts/upload",{method:"POST",signal,headers:{"Content-Type":"application/json",Authorization:"Bearer "+grant.current},body:JSON.stringify(parsed.data)});
    const result=await response.json();
    if(!response.ok || !result.ok) throw new Error(result.code ?? "PERSISTENCE_FAILED");
    setDraft(result.value as AgentDraftView);setText("");setPrompt("");
    } finally {window.clearTimeout(timeout);}
  }
  async function fileUpload(file:File) {
    if(!file.name.toLowerCase().endsWith(".json")) {setError("Choose a .veil-agent.json file. Executable files and ZIP bundles are not supported.");return;}
    if(file.size > 64*1024) {setError("The file exceeds the 64 KB limit.");return;}
    await run(async signal=>{setFilename(file.name+" · "+file.size.toLocaleString()+" bytes");await upload(await file.text(),signal);});
  }
  async function preparePrompt(signal:AbortSignal) {
    const value=await ensureDraft(signal);setMode("coding");
    const origin=window.location.origin;
    const uploadUrl=new URL(apiUrl("/api/agent-drafts/upload"),origin).href;
    setPrompt([
      "Build a private deterministic poker agent for Veil Arena. Read "+origin+"/AGENT.md for the strict veil-agent.v1 package schema and engine rules.",
      "Use the library draft workflow. No open competition is needed. Use holdem-sealed-v0.3 unless I specify another supported engine.",
      ...(value.targetAgentId ? ["This is an explicit update. Keep agentId exactly "+value.targetAgentId+"."] : ["Choose a new unique agentId for my library."]),
      "Validate the package, then POST the raw JSON package (not a wrapper) to "+uploadUrl+" with Content-Type: application/json and Authorization: Bearer "+grant.current+".",
      "This upload grant expires at "+value.expiresAt+". Treat it as a secret; never commit, log, or share it beyond the upload request. It permits one immutable draft upload only. On a network error, retry the identical package with the same grant; do not change its content.",
      "Return this review link to me: "+origin+"/profile/agents/new?draft="+value.id,
      "I will review and save the agent. Do not use the legacy competition submission endpoint. Do not request my wallet key, seed phrase, signature, browser session, or account credentials. Do not save, enter a competition, or make a transaction for me.",
    ].join("\n\n"));
  }
  async function chooseCompetitions() {
    setChoosing(true);setCompetitionError(false);
    try {setCompetitions(await onboardingRequest<CompetitionSummary[]>("/api/competitions"));} catch {setCompetitionError(true);}
  }
  const effectiveStatus=draft && draft.status !== "saved" && draft.status !== "revoked" && new Date(draft.expiresAt).getTime() <= clock ? "expired" : draft?.status;
  const isReady=effectiveStatus === "ready";
  const isSaved=effectiveStatus === "saved";
  const returnTo="/profile/agents/new"+(initialDraftId ? "?draft="+encodeURIComponent(initialDraftId) : targetAgentId ? "?update="+encodeURIComponent(targetAgentId) : "");
  const target=draft?.targetAgentId ?? targetAgentId;
  const available=(competitions??[]).filter(c=>c.status === "open" && c.entryMode === "open" && new Date(c.locksAt).getTime()>clock && c.rulesetVersion === draft?.agent?.engineVersion);

  return <div className="profile-page"><ArenaNav backHref="/profile" backLabel="My agents" /><main className="profile-main onboarding-main">
    <div className="onboarding-top"><Link href="/profile">My agents</Link><span> / {target ? "Update agent" : "Add agent"}</span></div>
    <ol className="onboarding-progress" aria-label="Add agent progress"><li aria-current={!isReady&&!isSaved ? "step":undefined}>1 Add agent</li><li aria-current={isReady ? "step":undefined}>2 Review</li><li aria-current={isSaved ? "step":undefined}>3 Save</li></ol>
    <section className="profile-hero"><h1>{isSaved ? "Saved to My agents." : isReady ? "Review your agent." : target ? "Update your agent." : "Add your agent."}</h1><p>{isSaved ? "Your package is ready whenever you are. Choosing a competition is optional." : "Bring a package from your coding agent or upload a file. Review it here before saving it to your private library."}</p></section>
    {checking ? <p role="status">Opening your private library...</p> : !session ? <section className="profile-state"><h2>Sign in to add an agent</h2><p>Your wallet identifies your private library. No X account or open competition is needed to save.</p><Link className="profile-primary" href={"/sign-in?returnTo="+encodeURIComponent(returnTo)}>Sign in with wallet</Link></section> : <>
      {target && !isSaved ? <p className="onboarding-target">Updating <code>{target}</code>. Existing competition entries keep their sealed versions.</p> : null}
      {effectiveStatus === "expired" || effectiveStatus === "revoked" ? <section className="profile-state"><h2>{effectiveStatus === "expired" ? "This draft expired" : "Upload permission revoked"}</h2><p>Your saved agents are unchanged.</p><a className="profile-primary" href="/profile/agents/new">Start a new draft</a></section> : null}
      {!draft && mode === "choose" ? <div className="onboarding-options">
        <button type="button" disabled={busy} onClick={()=>void run(preparePrompt)}><strong>Send from coding agent</strong><span>Copy one prompt. Your coding agent sends the package here for review.</span><b>Create upload prompt →</b></button>
        <button type="button" disabled={busy} onClick={()=>{setMode("file");setError("");}}><strong>Upload file</strong><span>Already have a .veil-agent.json package? Choose it from your device.</span><b>Choose a file →</b></button>
      </div> : null}
      {mode === "file" && !draft ? <section className="onboarding-panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy && e.dataTransfer.files[0]) void fileUpload(e.dataTransfer.files[0]);}}>
        <h2>Upload your package</h2><p>Choose or drop a .veil-agent.json file, up to 64 KB.</p>
        <label className="onboarding-file">Choose agent file<input aria-label="Choose agent file" type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void fileUpload(file);e.target.value="";}} /></label>
        <details><summary>Advanced: paste JSON</summary><label>Agent package<textarea value={text} onChange={e=>setText(e.target.value)} spellCheck={false} /></label><button type="button" className="profile-secondary" disabled={busy || !text.trim()} onClick={()=>void run(signal=>upload(text,signal))}>Review package</button></details>
        <button type="button" className="profile-secondary" disabled={busy} onClick={()=>setMode("choose")}>Other upload method</button>
      </section> : null}
      {draft && effectiveStatus === "pending" ? <section className="onboarding-panel"><h2>{mode === "file" ? "Upload not yet confirmed" : "Send this to your coding agent"}</h2>
        {prompt ? <><p>This prompt includes a private upload permission. Give it only to the coding agent you choose.</p><textarea aria-label="Coding agent prompt" readOnly value={prompt} rows={10} /><button type="button" className="profile-primary" onClick={()=>void navigator.clipboard.writeText(prompt).then(()=>setNotice("Prompt copied. Paste it into your coding agent.")).catch(()=>setError("Copy was unavailable. Select the prompt above and copy it manually."))}>Copy prompt</button></> : <p>Waiting for a package. The upload permission is kept only in the tab where you created it. You can still review the package here when it arrives.</p>}
        {mode === "file" ? <><label className="onboarding-file">Retry file upload<input aria-label="Retry file upload" type="file" disabled={busy} accept=".json,application/json" onChange={e=>{if(e.target.files?.[0])void fileUpload(e.target.files[0]);}} /></label>{text ? <button type="button" className="profile-secondary" disabled={busy} onClick={()=>void run(signal=>upload(text,signal))}>Retry package upload</button>:null}</> : null}
        <p>Expires {new Date(draft.expiresAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}. You can leave this tab and return through My agents.</p>
        <button type="button" className="profile-secondary" disabled={busy} onClick={()=>void refresh()}>Check for upload</button>
        <button type="button" className="profile-secondary" disabled={busy} onClick={()=>void run(async signal=>{setDraft(await onboardingRequest<AgentDraftView>("/api/profile/agent-drafts/"+draft.id,{action:"revoke"},signal));grant.current="";setPrompt("");})}>Revoke upload permission</button>
      </section> : null}
      {(isReady || isSaved) && draft?.agent ? <section className="onboarding-panel" aria-label="Agent review">
        <span className="hub-kicker">{isSaved ? "PRIVATE LIBRARY" : "PACKAGE VALIDATED"}</span><h2>{draft.agent.displayName}</h2>{filename ? <p className="onboarding-filename">{filename}</p> : null}
        <dl className="onboarding-metadata"><div><dt>Agent ID</dt><dd><code>{draft.agent.agentId}</code></dd></div><div><dt>Engine</dt><dd>{draft.agent.engineVersion}</dd></div><div><dt>Rules</dt><dd>{draft.agent.ruleCount}</dd></div><div><dt>{isSaved ? "Saved version" : "Library action"}</dt><dd>{isSaved ? "V"+draft.agent.version : target ? "Update existing agent" : "Save new agent"}</dd></div></dl>
        <p>The package passed format and policy checks. This does not measure its playing strength.</p><p>Your strategy is encrypted in storage and hidden from other players. Veil Arena&apos;s trusted backend and privileged operators can access it. The coding service you use also sees the package you ask it to build.</p>
        <details><summary>Package fingerprint</summary><code className="onboarding-commitment">{draft.agent.artifactCommitment}</code></details>
        {isReady ? <div className="onboarding-actions"><button type="button" className="profile-primary" disabled={busy} onClick={()=>void run(async signal=>{setDraft(await onboardingRequest<AgentDraftView>("/api/profile/agent-drafts/"+draft.id,{action:"save",commitment:draft.agent!.artifactCommitment},signal));grant.current="";setPrompt("");})}>{busy ? "Saving..." : target ? "Save update" : "Save agent"}</button><button type="button" className="profile-secondary" disabled={busy} onClick={()=>void run(async signal=>setDraft(await onboardingRequest<AgentDraftView>("/api/profile/agent-drafts/"+draft.id,{action:"revoke"},signal)))}>Discard draft</button></div> : <div className="onboarding-actions"><button type="button" className="profile-primary" onClick={()=>void chooseCompetitions()}>Choose competition</button><Link className="profile-secondary" href="/profile">Back to My agents</Link></div>}
      </section> : null}
      {isSaved && choosing ? <section className="onboarding-panel"><h2>Choose a competition</h2>{competitionError ? <p role="alert">Competitions could not be loaded. <button type="button" onClick={()=>void chooseCompetitions()}>Try again</button></p> : !competitions ? <p role="status">Loading competitions...</p> : available.length ? available.map(c=><article className="onboarding-competition" key={c.projectId+":"+c.id}><div><h3>{c.name}</h3><p>{c.entryCount} / {c.maxEntries} entries · {c.rulesetVersion}</p></div><Link className="profile-secondary" href={"/play?project="+encodeURIComponent(c.projectId)+"&season="+encodeURIComponent(c.id)+"&agent="+encodeURIComponent(draft!.agent!.agentId)}>Review entry</Link></article>) : <p>No compatible public competition is accepting entries right now. Your agent is saved; come back when one opens or use a private invitation.</p>}</section> : null}
      {!isReady && !isSaved ? <p className="onboarding-privacy">Packages are encrypted in storage. Veil Arena&apos;s trusted backend can read them. Upload permissions cannot save agents, enter competitions, or move funds.</p> : null}
    </>}
    {busy ? <p role="status">Working on your draft...</p> : null}{notice ? <p role="status">{notice}</p> : null}{error ? <div className="onboarding-error" role="alert"><p>{error}</p><button type="button" className="profile-secondary" disabled={busy} onClick={()=>void refresh()}>Refresh status</button><Link href="/profile">Open My agents</Link></div> : null}
  </main></div>;
}
