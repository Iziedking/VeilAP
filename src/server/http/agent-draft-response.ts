import { jsonBodyErrorResponse } from "./json-body";
import { serviceResponse } from "./service-response";
export function agentDraftError(error: unknown) {
  const body = jsonBodyErrorResponse(error); if (body) return body;
  const code = error instanceof Error ? error.message : "PERSISTENCE_FAILED";
  if (code.startsWith("DRAFT_") || code === "AGENT_PACKAGE_INVALID") return serviceResponse({ok:false,code});
  return serviceResponse({ok:false,code:code.startsWith("PARTICIPANT_VAULT_KEY_") ? "CONFIGURATION_MISSING" : "PERSISTENCE_FAILED"});
}
