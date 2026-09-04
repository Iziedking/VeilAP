import type { Metadata } from "next";
import { AgentOnboarding } from "@/components/agent-onboarding";
export const metadata:Metadata={title:"Add agent | Veil Arena",description:"Upload a private agent, review it, and save it before choosing a competition."};
// Next 16.3.3 installed page.md, read 2026-09-04: searchParams is a Promise.
export default async function Page({searchParams}:{searchParams:Promise<{draft?:string|string[];update?:string|string[]}>}) {
  const query=await searchParams;
  const draft=typeof query.draft === "string" ? query.draft : "";
  const update=typeof query.update === "string" ? query.update : "";
  return <AgentOnboarding key={draft+":"+update} initialDraftId={draft} targetAgentId={update} />;
}
