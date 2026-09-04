import { z } from "zod";
import { readRequestActor } from "@/server/auth/request-actor";
import { readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { agentDraftError } from "@/server/http/agent-draft-response";
import { getParticipantAgentDraftService } from "@/server/arena/participant-agent-draft-runtime";
export const runtime = "nodejs";
type Context = {params:Promise<{id:string}>};
const actionSchema=z.discriminatedUnion("action",[z.object({action:z.literal("save"),commitment:z.string().min(1).max(128)}).strict(),z.object({action:z.literal("revoke")}).strict()]);
export async function GET(_request:Request,context:Context) {
  const actor=await readRequestActor(); if(!actor.ok) return serviceResponse(actor);
  try { return serviceResponse({ok:true,value:await getParticipantAgentDraftService().review(actor.walletAddress,(await context.params).id)}); } catch(error) { return agentDraftError(error); }
}
export async function POST(request:Request,context:Context) {
  const actor=await readRequestActor(); if(!actor.ok) return serviceResponse(actor);
  try {
    const input=actionSchema.safeParse(await readJsonBody(request,1024));
    if(!input.success) return serviceResponse({ok:false,code:"INVALID_INPUT"});
    const service=getParticipantAgentDraftService(); const {id}=await context.params;
    const value=input.data.action === "save" ? await service.save(actor.walletAddress,id,input.data.commitment) : await service.revoke(actor.walletAddress,id);
    return serviceResponse({ok:true,value});
  } catch(error) { return agentDraftError(error); }
}
