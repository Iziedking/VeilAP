import { describe, expect, it } from "vitest";

import { buildProofReport } from "./proof-report";

describe("Veil Arena release proof", () => {
  it("is deterministic and publishes only committed match evidence", () => {
    const report = buildProofReport();

    expect(report.product).toBe("Veil Arena");
    expect(report.engineVersion).toBe("holdem-sealed-v0.2");
    expect(report.match.pairedDeals).toBe(8);
    expect(report.match.publicHandReceipts).toBe(16);
    expect(report.match.seatSwaps).toBe(8);
    expect(report.match.transcriptRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(report.verification).toEqual({
      deterministicReplay: true,
      transcriptInclusion: true,
      tamperingRejected: true,
      publicEvidenceOmitsHoleCards: true,
      publicEvidenceOmitsStrategyRules: true,
      publicEvidenceOmitsRawSeed: true,
    });
  });

  it("states the external reward proof boundary", () => {
    const report = buildProofReport();
    const serialized = JSON.stringify(report);

    expect(report.rewardBoundary.requiredExternalEvidence).toHaveLength(2);
    expect(serialized).not.toContain("royaltyCalculation");
    expect(serialized).not.toContain("agreementDigest");
  });
});
