import { z } from "zod";
import { readRequestActor } from "@/server/auth/request-actor";
import { readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { agentDraftError } from "@/server/http/agent-draft-response";
import { getParticipantAgentDraftService } from "@/server/arena/participant-agent-draft-runtime";
export const runtime = "nodejs";
const createSchema = z.object({grant:z.string().regex(/^[a-f0-9]{64}$/),targetAgentId:z.string().min(3).max(32).optional()}).strict();
export async function GET() {
  const actor=await readRequestActor(); if(!actor.ok) return serviceResponse(actor);
  try { return serviceResponse({ok:true,value:await getParticipantAgentDraftService().list(actor.walletAddress)}); } catch(error) { return agentDraftError(error); }
}
export async function POST(request:Request) {
  const actor=await readRequestActor(); if(!actor.ok) return serviceResponse(actor);
  try {
    const input=createSchema.safeParse(await readJsonBody(request,1024));
    if(!input.success) return serviceResponse({ok:false,code:"INVALID_INPUT"});
    return serviceResponse({ok:true,value:await getParticipantAgentDraftService().create(actor.walletAddress,input.data.grant,input.data.targetAgentId)});
  } catch(error) { return agentDraftError(error); }
}
