"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";
import type { WorkspaceState } from "@/features/workspace/workspace-store";
import { PrivacyDisclosure } from "./privacy-disclosure";
import { ProjectRegister } from "./project-register";
import { ProofTimeline } from "./proof-timeline";
import { ReceiptSheet } from "./receipt-sheet";
import { ReleaseReview } from "./release-review";

function formatUsdcMinor(amountMinor: bigint): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number(amountMinor / 1_000_000n),
  );
}

export function WorkspaceShell({ workspace }: { workspace: WorkspaceState }) {
  const [walletNotice, setWalletNotice] = useState(false);

  useEffect(() => {
    if (!walletNotice) return;
    const timer = window.setTimeout(() => setWalletNotice(false), 3400);
    return () => window.clearTimeout(timer);
  }, [walletNotice]);

  return (
    <div className="site-frame">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="VeilAP home"><VeilLogo /></Link>
        <div className="office-title">
          <span>{workspace.project.company}</span>
          <strong>Private delivery office</strong>
        </div>
        <div className="network-register">
          <span className="registration-dot" aria-hidden="true" />
          <div><span>NETWORK</span><strong>SN_MAIN</strong></div>
        </div>
      </header>

      <nav className="folio-nav" aria-label="Workspace sections">
        <a className="current" href="#project">01 / PROJECT</a>
        <a href="#proof-stream">02 / PROOF STREAM</a>
        <a href="#disclosure">03 / DISCLOSURE</a>
        <a href="#release">04 / RELEASE</a>
        <button type="button" onClick={() => setWalletNotice(true)}>CONNECT PRIVATE WALLET</button>
      </nav>

      <div className="preview-ribbon" role="note">
        <span>PREVIEW RECORD</span>
        Synthetic project and values. No wallet connected. No funds moved.
      </div>

      <main id="project" className="ledger-page">
        <section className="run-heading" aria-labelledby="project-title">
          <div className="run-kicker"><span>PROJECT</span><strong>{workspace.project.id}</strong></div>
          <div className="run-title-block">
            <p>Private work release / Agreement version {workspace.project.agreementVersion}</p>
            <h1 id="project-title" className="workspace-project-title">{workspace.project.name}</h1>
            <p className="run-description">
              Bind sensitive work to an exact delivery, approve it with a human decision, and settle privately through the company&apos;s Starknet wallet.
            </p>
          </div>
          <dl className="run-totals">
            <div><dt>Contributor</dt><dd>{workspace.project.contributorAddress}</dd></div>
            <div><dt>Royalty rule</dt><dd>{workspace.project.royaltyBps / 100}%</dd></div>
            <div className="total-line"><dt>Milestone</dt><dd>{formatUsdcMinor(workspace.project.milestoneMinor)} <small>USDC</small></dd></div>
          </dl>
        </section>

        <ProofTimeline workspace={workspace} />

        <section className="document-grid">
          <ProjectRegister workspace={workspace} />
          <PrivacyDisclosure />
        </section>

        <ReleaseReview workspace={workspace} onPreviewWallet={() => setWalletNotice(true)} />
        <ReceiptSheet workspace={workspace} />
      </main>

      {walletNotice ? (
        <div className="notice-ticket" role="status">
          <span>WALLET INTERFACE / PREVIEW</span>
          <strong>No access was requested.</strong>
          <p>Wallet capability and signing arrive in the next approved build group.</p>
        </div>
      ) : null}
    </div>
  );
}
