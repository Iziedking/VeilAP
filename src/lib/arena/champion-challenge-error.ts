export type ChampionChallengeFailure = {
  code: string;
  requestId?: string;
  stage?: string;
};

const stageLabels: Record<string, string> = {
  authentication: "checking your wallet session",
  project: "creating your private arena",
  competition: "opening the competition",
  champion: "seating Null Jack",
  configuration: "checking the arena configuration",
  unknown: "preparing the challenge",
};

const codeMessages: Record<string, string> = {
  CONFIGURATION_MISSING: "The arena is missing a required server setting.",
  INVALID_INPUT: "The challenge request was not valid.",
  PERSISTENCE_FAILED: "The arena could not save the challenge.",
  ENCRYPTION_FAILED: "The private arena could not be secured.",
  SIGNING_UNAVAILABLE: "The arena receipt signer is not available.",
};

export function championChallengeErrorMessage(failure: ChampionChallengeFailure): string {
  const action = stageLabels[failure.stage ?? ""] ?? "preparing the challenge";
  const reason = codeMessages[failure.code] ?? `The server returned ${failure.code}.`;
  const reference = failure.requestId ? ` Reference ${failure.requestId}.` : "";
  return `We could not finish ${action}. ${reason}${reference}`;
}
