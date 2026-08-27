"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";

const storyFrames = [
  {
    id: "private-proof",
    label: "PRIVATE PROOF / STARKNET",
    title: <>Private proof.<br />Verifiable delivery.<br /><em>Protected payment.</em></>,
    body: "Bind sensitive work to an exact delivery, approve it with a human decision, and settle privately through your Starknet wallet.",
  },
  {
    id: "exact-checkpoint",
    label: "ONE BOUND DELIVERY",
    title: <>One agreement.<br />One exact <em>checkpoint.</em></>,
    body: "Each proof stream is append-only. Changed evidence is refused before it can reach human acceptance or payment preparation.",
  },
  {
    id: "human-release",
    label: "HUMAN CONTROL / PRIVATE SETTLEMENT",
    title: <>Verify delivery.<br />Release <em>privately.</em></>,
    body: "Verification informs the decision. Your company accepts the work, reviews the live pool fee, and signs the private STRK20 release.",
  },
] as const;

export function VeilApLanding() {
  const [activeFrame, setActiveFrame] = useState(0);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-veil-frame]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible) setActiveFrame(Number((visible.target as HTMLElement).dataset.veilFrame));
      },
      { rootMargin: "-28% 0px -42%", threshold: [0, 0.25, 0.5, 0.75] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`ad-page is-frame-${activeFrame}`}>
      <header className="ad-nav">
        <a className="ad-brand" href="#top" aria-label="VeilAP home"><VeilLogo /></a>
        <div className="ad-nav-actions">
          <Link className="ad-sign-in" href="/sign-in">Sign in</Link>
        </div>
      </header>

      <main id="top">
        <div className="ad-story">
          <div className="ad-product-rail" aria-hidden="true">
            <div className="ad-product-sticky">
              <div className="ad-register-shell">
                <div className="ad-register-top"><span>VEILAP</span><strong>AP-0827</strong></div>

                <div className={`ad-register-screen ${activeFrame === 0 ? "active" : ""}`}>
                  <span className="ad-screen-label">ZK COMPLIANCE MODULE</span>
                  <div className="ad-screen-total"><strong>47,850</strong><small>USDC</small></div>
                  <div className="ad-screen-facts"><span>Agreement v2</span><span>2 checkpoints</span></div>
                  <div className="ad-ready-line"><span>PROOF CONTROL</span><strong>READY</strong></div>
                  <div className="ad-release-button">REVIEW CHECKPOINT <span>→</span></div>
                </div>

                <div className={`ad-register-screen ${activeFrame === 1 ? "active" : ""}`}>
                  <span className="ad-screen-label">APPEND-ONLY PROOF STREAM / 02</span>
                  <div className="ad-payee-row"><i>01</i><span><strong>Circuit package / r1</strong><small>DIGEST CHANGED</small></span><b>REFUSED</b></div>
                  <div className="ad-payee-row"><i>02</i><span><strong>Circuit package / r2</strong><small>AGREEMENT V2 MATCH</small></span><b>READY</b></div>
                  <div className="ad-control-total"><span>HUMAN DECISION</span><strong>REQUIRED</strong></div>
                </div>

                <div className={`ad-register-screen ad-private-screen ${activeFrame === 2 ? "active" : ""}`}>
                  <span className="ad-screen-label">CONTROLLED DISCLOSURE</span>
                  <h3>Sensitive work stays under the veil.</h3>
                  <div className="ad-redacted-line"><span>TERMS</span><i /></div>
                  <div className="ad-redacted-line"><span>PROOF</span><i className="short" /></div>
                  <div className="ad-redacted-line"><span>VALUE</span><i /></div>
                  <div className="ad-wallet-boundary"><span>WALLET BOUNDARY</span><strong>Proof stays in the wallet</strong></div>
                  <div className="ad-receipt-ready">RELEASE BOUND <span>✓</span></div>
                </div>
              </div>
            </div>
          </div>

          {storyFrames.map((frame, index) => (
            <section
              className="veil-frame"
              data-veil-frame={index}
              id={frame.id}
              key={frame.id}
              aria-labelledby={`${frame.id}-title`}
            >
              <div className="veil-frame-title">
                <p>{frame.label}</p>
                {index === 0 ? <h1 id={`${frame.id}-title`}>{frame.title}</h1> : <h2 id={`${frame.id}-title`}>{frame.title}</h2>}
              </div>
              <div className="veil-frame-spacer" />
              <div className="veil-frame-copy">
                <p>{frame.body}</p>
                {index === 0 ? (
                  <div className="ad-hero-actions">
                    <Link className="ad-primary-cta" href="/sign-in">Get started <span aria-hidden="true">→</span></Link>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>

        <section className="ad-boundary" id="privacy" aria-labelledby="privacy-boundary-title">
          <div>
            <p>WHAT PRIVATE MEANS</p>
            <h2 id="privacy-boundary-title">The work stays private.<br />The limits stay clear.</h2>
          </div>
          <div className="ad-boundary-list">
            <article><span>A / ENCRYPTED IN VEILAP</span><strong>Terms, evidence, contributor relationship, review, and release values</strong></article>
            <article><span>B / STILL VISIBLE</span><strong>Pool activity, timing, and public deposit or withdrawal legs</strong></article>
          </div>
          <p className="ad-boundary-note">Authorized reviewers may receive decrypted evidence. VeilAP never receives your wallet signing key or STRK20 viewing key.</p>
        </section>

      </main>

      <footer className="veil-footer">
        <div className="veil-footer-top">
          <div className="veil-footer-brand">
            <VeilLogo />
            <p>Private proof-backed settlement for sensitive work.</p>
          </div>
          <nav className="veil-footer-links" aria-label="Footer navigation">
            <a href="#top">How it works</a>
            <a href="#privacy">Privacy model</a>
            <Link href="/workspace">Workspace</Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
          <div className="veil-footer-meta">
            <span>STARKNET / STRK20</span>
            <span>HUMAN-APPROVED RELEASE</span>
          </div>
        </div>
        <div className="veil-footer-bottom">
          <p>VeilAP is preview software. It proves its recorded process, not legal ownership or defect-free work.</p>
          <small>© 2026 VeilAP. Veil Attested Payments.</small>
        </div>
      </footer>
    </div>
  );
}
