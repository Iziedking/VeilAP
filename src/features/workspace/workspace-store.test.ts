import { describe, expect, it } from "vitest";

import { previewProject } from "./preview-fixtures";
import { createWorkspaceStore } from "./workspace-store";

describe("preview workspace", () => {
  it("uses the approved synthetic project and money values", () => {
    expect(previewProject.name).toBe("ZK Compliance Module");
    expect(previewProject.id).toBe("VAP-0827");
    expect(previewProject.agreementVersion).toBe(2);
    expect(previewProject.milestoneMinor).toBe(47_850_000_000n);
    expect(previewProject.royaltyBps).toBe(750);
    expect(previewProject.checkpoints).toHaveLength(2);
  });

  it("refuses the checkpoint whose artifact digest changed", () => {
    const store = createWorkspaceStore();

    expect(store.getState().acceptCheckpoint("CHK-0001")).toEqual({
      ok: false,
      code: "ARTIFACT_TAMPERED",
    });
    expect(store.getState().release).toBeNull();
  });

  it("prepares one milestone release and refuses a duplicate click", () => {
    const store = createWorkspaceStore();

    expect(store.getState().acceptCheckpoint("CHK-0002")).toEqual({
      ok: true,
      value: { releaseId: "REL-PREVIEW-0001" },
    });
    expect(store.getState().release?.state.kind).toBe("prepared");
    expect(store.getState().release?.amountMinor).toBe(47_850_000_000n);

    expect(store.getState().acceptCheckpoint("CHK-0002")).toEqual({
      ok: false,
      code: "DUPLICATE_RELEASE",
    });
  });

  it("never reports a wallet call or moved funds in preview", () => {
    const store = createWorkspaceStore();
    store.getState().acceptCheckpoint("CHK-0002");

    expect(store.getState().mode).toBe("preview");
    expect(store.getState().walletRequested).toBe(false);
    expect(store.getState().fundsMoved).toBe(false);
  });
});
