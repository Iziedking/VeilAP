import { getAuthRepositories, getSessionSecret, getWalletHashPepper } from "@/server/auth/runtime";
import { readParticipantVaultKeys } from "@/server/crypto/participant-vault-config";
import { ParticipantAgentDraftService } from "./participant-agent-drafts";
export function getParticipantAgentDraftService() {
  return new ParticipantAgentDraftService({ repositories:getAuthRepositories().projects, walletHashPepper:getWalletHashPepper(),sessionSecret:getSessionSecret(),vaultKeys:readParticipantVaultKeys() });
}
