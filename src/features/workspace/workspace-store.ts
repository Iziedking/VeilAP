"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { verifyCheckpointArtifact } from "@/domain/checkpoint";
import {
  reserveRelease,
  type ReleaseRecord,
} from "@/domain/release";
import type { DomainErrorCode } from "@/domain/types";
import { previewProject } from "./preview-fixtures";

type PreviewActionCode = DomainErrorCode | "CHECKPOINT_NOT_FOUND";

type PreviewActionResult =
  | { ok: true; value: { releaseId: string } }
  | { ok: false; code: PreviewActionCode };

export type WorkspaceState = {
  mode: "preview";
  project: typeof previewProject;
  selectedCheckpointId: string;
  reviewOpen: boolean;
  release: ReleaseRecord | null;
  lastActionCode: PreviewActionCode | null;
  walletRequested: false;
  fundsMoved: false;
  openCheckpoint: (checkpointId: string) => void;
  closeReview: () => void;
  acceptCheckpoint: (checkpointId: string) => PreviewActionResult;
};

export function createWorkspaceStore() {
  return createStore<WorkspaceState>((set, get) => ({
    mode: "preview",
    project: previewProject,
    selectedCheckpointId: "CHK-0002",
    reviewOpen: false,
    release: null,
    lastActionCode: null,
    walletRequested: false,
    fundsMoved: false,
    openCheckpoint: (checkpointId) => {
      set({ selectedCheckpointId: checkpointId, reviewOpen: true, lastActionCode: null });
    },
    closeReview: () => set({ reviewOpen: false }),
    acceptCheckpoint: (checkpointId) => {
      const state = get();
      const checkpoint = state.project.checkpoints.find(
        (candidate) => candidate.record.input.id === checkpointId,
      );
      if (!checkpoint) {
        const result = { ok: false, code: "CHECKPOINT_NOT_FOUND" } as const;
        set({ lastActionCode: result.code });
        return result;
      }

      const evidence = verifyCheckpointArtifact(checkpoint.record, checkpoint.artifact);
      if (!evidence.ok) {
        const result = { ok: false, code: evidence.code } as const;
        set({ lastActionCode: result.code });
        return result;
      }

      const reserved = reserveRelease(
        { releases: state.release ? [state.release] : [] },
        {
          id: "REL-PREVIEW-0001",
          projectId: state.project.id,
          kind: "milestone",
          sourceId: checkpointId,
          amountMinor: state.project.milestoneMinor,
          preparedAt: state.project.preparedAt,
        },
      );
      if (!reserved.ok) {
        const result = { ok: false, code: reserved.code } as const;
        set({ lastActionCode: result.code });
        return result;
      }

      set({
        selectedCheckpointId: checkpointId,
        release: reserved.value.release,
        lastActionCode: null,
      });
      return { ok: true, value: { releaseId: reserved.value.release.id } };
    },
  }));
}

const previewWorkspaceStore = createWorkspaceStore();

export function useWorkspaceStore(): WorkspaceState {
  return useStore(previewWorkspaceStore);
}
