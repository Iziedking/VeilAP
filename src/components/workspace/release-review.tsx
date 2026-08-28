"use client";

import type { WorkspaceState } from "@/features/workspace/workspace-store";

function formatUsdcMinor(amountMinor: bigint): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number(amountMinor / 1_000_000n),
  );
}

function shortDigest(digest: string): string {
  return `${digest.slice(0, 14)}…${digest.slice(-8)}`;
}

export function ReleaseReview({
  workspace,
  onPreviewWallet,
}: {
  workspace: WorkspaceState;
  onPreviewWallet: () => void;
}) {
  const checkpoint = workspace.project.checkpoints.find(
    (candidate) => candidate.record.input.id === workspace.selectedCheckpointId,
  ) ?? workspace.project.checkpoints[1];
  const invalid = checkpoint.displayStatus === "invalid";
  const releasePrepared = workspace.release?.state.kind === "prepared";
  let reviewTitle = "Accept the exact checkpoint, not a moving target.";
  if (invalid) {
    reviewTitle = "The artifact changed after its checkpoint was recorded.";
  } else if (releasePrepared) {
    reviewTitle = "The release intent is prepared, not paid.";
  }

  function acceptCheckpoint() {
    workspace.acceptCheckpoint(checkpoint.record.input.id);
  }

  return (
    <>
      <section id="release" className="release-footer">
        <div className="signatory-lines">
          <div><span>CONTRIBUTOR</span><strong>{workspace.project.contributorAddress}</strong><i /></div>
          <div><span>COMPANY DECISION</span><strong>{releasePrepared ? "ACCEPTED / PREVIEW" : "AWAITING HUMAN"}</strong><i /></div>
        </div>
        <div className="release-action">
          <div>
            <span>{releasePrepared ? "PREPARED RELEASE" : "REVIEW CONTROL"}</span>
            <strong>
              {releasePrepared
                ? `${formatUsdcMinor(workspace.project.milestoneMinor)} USDC / MILESTONE`
                : "CHECKPOINT 02 / AGREEMENT V2"}
            </strong>
            <small>{releasePrepared ? "The intent is reserved before any wallet prompt." : "A company decision is required before release."}</small>
          </div>
          <button type="button" onClick={() => workspace.openCheckpoint("CHK-0002")}>
            {releasePrepared ? "INSPECT PREPARED RELEASE" : "REVIEW CHECKPOINT"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      {workspace.reviewOpen ? (
        <div
          className="authorization-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) workspace.closeReview();
          }}
        >
          <section className="authorization-sheet" role="dialog" aria-modal="true" aria-labelledby="authorization-title">
            <header>
              <div>
                <span>{invalid ? "EVIDENCE REFUSAL" : "CHECKPOINT DECISION"}</span>
                <strong>{workspace.project.id} / {checkpoint.record.input.id}</strong>
              </div>
              <button type="button" onClick={workspace.closeReview} aria-label="Close review">CLOSE ×</button>
            </header>

            <div className="authorization-title">
              <p>{invalid ? "DETERMINISTIC CONTROL / STOPPED" : "HUMAN CONTROL / PREVIEW"}</p>
              <h2 id="authorization-title">{reviewTitle}</h2>
            </div>

            <div className="authorization-register checkpoint-review-register">
              <div>
                <span>01</span>
                <span><strong>Agreement version</strong><small>TERMS COMMITMENT</small></span>
                <strong>V{checkpoint.record.input.agreementVersion}</strong>
              </div>
              <div>
                <span>02</span>
                <span><strong>Checkpoint digest</strong><small>{shortDigest(checkpoint.record.digest)}</small></span>
                <strong>{invalid ? "MISMATCH" : "MATCH"}</strong>
              </div>
              <div>
                <span>03</span>
                <span><strong>Milestone</strong><small>SERVER RECOMPUTES BEFORE LIVE RELEASE</small></span>
                <strong>{formatUsdcMinor(workspace.project.milestoneMinor)} USDC</strong>
              </div>
            </div>

            <dl className="authorization-facts">
              <div><dt>PROJECT</dt><dd>{workspace.project.name.toUpperCase()}</dd></div>
              <div><dt>CONTRIBUTOR</dt><dd>{workspace.project.contributorAddress}</dd></div>
              <div><dt>DECISION OWNER</dt><dd>COMPANY WALLET</dd></div>
              <div><dt>CURRENT MODE</dt><dd>SYNTHETIC PREVIEW</dd></div>
            </dl>

            <div className={`wallet-boundary ${invalid ? "refusal-boundary" : ""}`}>
              <span>{invalid ? "REFUSAL" : "AUTHORITY BOUNDARY"}</span>
              <p>
                {invalid
                  ? "VeilAP will not send changed evidence to human acceptance or prepare a release from it."
                  : "Verification may inform the company. It cannot accept work or release funds. The company wallet remains the final signer."
                    + " The preview mirrors this boundary without creating a server record."}
              </p>
            </div>

            <div className="authorization-actions">
              <button className="back-button" type="button" onClick={workspace.closeReview}>RETURN TO PROOF STREAM</button>
              {invalid ? null : releasePrepared ? (
                <button className="release-button" type="button" onClick={onPreviewWallet}>PREVIEW WALLET BOUNDARY</button>
              ) : (
                <button className="release-button" type="button" onClick={acceptCheckpoint}>ACCEPT / PREPARE RELEASE</button>
              )}
            </div>
            <p className="authorization-disclaimer">
              Synthetic project and values. No wallet connected. No funds moved.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
