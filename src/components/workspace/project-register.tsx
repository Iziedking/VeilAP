"use client";

import type { WorkspaceState } from "@/features/workspace/workspace-store";

function formatUsdcMinor(amountMinor: bigint): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number(amountMinor / 1_000_000n),
  );
}

function shortDigest(digest: string): string {
  return `${digest.slice(0, 10)}…${digest.slice(-6)}`;
}

export function ProjectRegister({ workspace }: { workspace: WorkspaceState }) {
  const releasePrepared = workspace.release?.state.kind === "prepared";

  return (
    <div id="proof-stream" className="register-sheet">
      <div className="sheet-caption">
        <div>
          <span>APPEND-ONLY PROOF STREAM</span>
          <strong>AGREEMENT-BOUND CHECKPOINTS</strong>
        </div>
        <p>02 / 02 recorded</p>
      </div>

      <div className="register-table" role="table" aria-label="Project checkpoint register">
        <div className="register-row register-columns" role="row">
          <span role="columnheader">LINE</span>
          <span role="columnheader">OPEN</span>
          <span role="columnheader">CHECKPOINT / EVIDENCE</span>
          <span role="columnheader">COMMITMENT</span>
          <span role="columnheader">TERMS</span>
          <span role="columnheader">RESULT</span>
        </div>

        {workspace.project.checkpoints.map((checkpoint, index) => {
          const checkpointId = checkpoint.record.input.id;
          const invalid = checkpoint.displayStatus === "invalid";
          const selected = workspace.selectedCheckpointId === checkpointId;
          let resultLabel = "READY";
          let resultDetail = "HUMAN REVIEW";
          if (invalid) {
            resultLabel = "REFUSED";
            resultDetail = "DIGEST MISMATCH";
          } else if (releasePrepared) {
            resultLabel = "PREPARED";
            resultDetail = "PREVIEW RELEASE";
          }

          return (
            <div
              className={`register-row ${selected ? "is-selected" : ""} ${invalid ? "is-locked" : ""}`}
              role="row"
              key={checkpointId}
            >
              <span className="line-number" role="cell">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span role="cell">
                <button
                  className={`checkpoint-open ${invalid ? "is-invalid" : "is-ready"}`}
                  type="button"
                  onClick={() => workspace.openCheckpoint(checkpointId)}
                  aria-label={`Open ${checkpoint.title}`}
                >
                  {invalid ? "!" : "→"}
                </button>
              </span>
              <span className="counterparty" role="cell">
                <strong>{checkpoint.title}</strong>
                <small>{checkpoint.note}</small>
              </span>
              <span className="reference" role="cell">
                <strong>{checkpointId}</strong>
                <small>{shortDigest(checkpoint.record.digest)}</small>
              </span>
              <span className="due-date" role="cell">
                V{checkpoint.record.input.agreementVersion} / S{checkpoint.record.input.sequence}
              </span>
              <span className={`ledger-amount checkpoint-result ${invalid ? "is-invalid" : "is-ready"}`} role="cell">
                <strong>{resultLabel}</strong>
                <small>{resultDetail}</small>
              </span>
            </div>
          );
        })}
      </div>

      <div className="register-total">
        <span>MILESTONE / AGREEMENT VERSION {workspace.project.agreementVersion}</span>
        <strong>
          {formatUsdcMinor(workspace.project.milestoneMinor)} <small>USDC</small>
        </strong>
      </div>

      <div className="authorization-track" aria-label="Attested payment progress">
        <div className="track-step done">
          <span>01</span><strong>TERMS LOCKED</strong><small>Agreement version 2</small>
        </div>
        <div className="track-step done">
          <span>02</span><strong>PROOF BOUND</strong><small>Exact artifact digest</small>
        </div>
        <div className={`track-step ${releasePrepared ? "done" : "active"}`}>
          <span>03</span><strong>HUMAN REVIEW</strong><small>{releasePrepared ? "Checkpoint accepted" : "Decision required"}</small>
        </div>
        <div className={`track-step ${releasePrepared ? "active" : ""}`}>
          <span>04</span><strong>PRIVATE RELEASE</strong><small>{releasePrepared ? "Preview prepared" : "Company wallet signs"}</small>
        </div>
      </div>
    </div>
  );
}
