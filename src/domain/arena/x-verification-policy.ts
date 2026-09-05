export type XVerificationSeason = {
  rules?: { rewardPolicy?: "optional" | "funded_before_start" };
  prizeStatus?: string;
};

/**
 * X proves account control only where a reward is funded or the competition
 * explicitly promises funding before play. Wallet access remains sufficient
 * for exhibition and optional-reward game modes.
 */
export function requiresXVerification(season: XVerificationSeason): boolean {
  return season.rules?.rewardPolicy === "funded_before_start" || season.prizeStatus === "funded";
}
