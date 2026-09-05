import { describe, expect, it } from "vitest";

import { requiresXVerification } from "./x-verification-policy";

describe("X verification policy", () => {
  it("requires X for a competition configured to fund rewards before play", () => {
    expect(requiresXVerification({ rules: { rewardPolicy: "funded_before_start" } })).toBe(true);
  });

  it("requires X for a legacy season whose prize pool is already funded", () => {
    expect(requiresXVerification({ prizeStatus: "funded" })).toBe(true);
  });

  it("keeps optional rewards and exhibitions testable with wallet access alone", () => {
    expect(requiresXVerification({ rules: { rewardPolicy: "optional" }, prizeStatus: "funding_pending" })).toBe(false);
    expect(requiresXVerification({ rules: { rewardPolicy: "optional" }, prizeStatus: "unknown" })).toBe(false);
  });
});
