import { apiFetch } from "./client";
import type { ApiEnvelope } from "@/components/arena/arena-types";
export async function onboardingRequest<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once:true });
  const timer = setTimeout(abort, 20_000);
  try {
  const response=await apiFetch(path,{signal:controller.signal,...(body === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  const result=await response.json() as ApiEnvelope<T>;
  if(!response.ok || !result.ok) throw new Error(result.ok ? "PERSISTENCE_FAILED" : result.code);
  return result.value;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export function onboardingError(error:unknown):string {
  const code=error instanceof Error ? error.message : "";
  const messages:Record<string,string>={
    AUTH_REQUIRED:"Sign in again to continue. Your saved agents remain in your account.",
    DRAFT_NOT_FOUND:"This draft is unavailable for this account. Open My agents with the wallet that created it.",
    DRAFT_EXPIRED:"This draft has expired. Start a new upload; your saved agents are unchanged.",
    DRAFT_REVOKED:"This upload permission was revoked. Start a new draft.",
    DRAFT_LIMIT_REACHED:"You can keep five active drafts and create twenty per day. Revoke an unused draft, or try again tomorrow.",
    DRAFT_UPDATE_REQUIRED:"That agent ID is already saved. Open My agents and choose Update for that agent.",
    DRAFT_VERSION_CONFLICT:"This agent changed since you started. Open My agents and start an update from its latest version.",
    DRAFT_AGENT_MISMATCH:"The package must use the agent ID selected for this update.",
    DRAFT_UPLOAD_CONFLICT:"This draft already holds a different package. Start a new draft to change it.",
    DRAFT_REVIEW_CHANGED:"The reviewed package does not match. Refresh the draft before saving.",
    AGENT_PACKAGE_INVALID:"The file is not a valid Veil agent package. Check AGENT.md and try again.",
    CONFIGURATION_MISSING:"Agent storage is not configured on this deployment. Try again after the operator restores it.",
    DRAFT_KEY_UNAVAILABLE:"This draft's encryption key is unavailable. The operator must restore the retained vault key before you can save it.",
  };
  return messages[code] ?? "We could not confirm that request. Reconnect and retry; the same draft is safe to retry.";
}
