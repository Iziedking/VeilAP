import { describe, expect, it } from "vitest";

import { previewMatch, previewReceiptRoot } from "./preview-match";

describe("preview match", () => {
  it("is a reproducible duplicate-deal receipt", () => {
    expect(previewMatch.engineVersion).toBe("holdem-sealed-v0.1");
    expect(previewMatch.hands).toHaveLength(36);
    expect(previewMatch.hands.filter((hand) => hand.seatSwapped)).toHaveLength(18);
    expect(previewReceiptRoot).toMatch(/^[0-9a-f]{8}\.\.\.[0-9a-f]{4}$/);
  });

  it("keeps private decision inputs out of the public receipt", () => {
    expect(JSON.stringify(previewMatch.publicReceipt)).not.toContain("holeCards");
    expect(JSON.stringify(previewMatch.publicReceipt)).not.toContain("policy");
  });
});
