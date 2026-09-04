import { readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { agentDraftError } from "@/server/http/agent-draft-response";
import { getParticipantAgentDraftService } from "@/server/arena/participant-agent-draft-runtime";
export const runtime="nodejs";
export async function POST(request:Request) {
  const grant=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if(!grant) return serviceResponse({ok:false,code:"AUTH_REQUIRED"});
  try {
    const input=await readJsonBody(request,64*1024);
    return serviceResponse({ok:true,value:await getParticipantAgentDraftService().upload(grant,input)});
  } catch(error) { return agentDraftError(error); }
}
