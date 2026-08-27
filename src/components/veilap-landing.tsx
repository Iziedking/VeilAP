"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";

const storyFrames = [
  {
    id: "private-payroll",
    label: "PRIVATE PAYROLL / STARKNET",
    title: <>Pay your team.<br />Keep payroll <em>private.</em></>,
    body: "Pay employees and suppliers in USDC without putting names, salaries, or invoice values on public display.",
  },
  {
    id: "one-run",
    label: "ONE CONTROLLED RUN",
    title: <>One payment run.<br />Every recipient.</>,
    body: "Check each payee and the total before release. Nothing moves until you confirm it in your wallet.",
  },
  {
    id: "clear-records",
    label: "PRIVATE ROUTE / CLEAR RECORD",
    title: <>Private payments.<br /><em>Clear records.</em></>,
    body: "Payment details stay concealed while your finance team keeps the approval trail and receipt it needs.",
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
                  <span className="ad-screen-label">AUGUST PAYMENT RUN</span>
                  <div className="ad-screen-total"><strong>47,850</strong><small>USDC</small></div>
                  <div className="ad-screen-facts"><span>3 recipients</span><span>4 countries</span></div>
                  <div className="ad-ready-line"><span>CONTROL CHECK</span><strong>READY</strong></div>
                  <div className="ad-release-button">REVIEW FOR RELEASE <span>→</span></div>
                </div>

                <div className={`ad-register-screen ${activeFrame === 1 ? "active" : ""}`}>
                  <span className="ad-screen-label">APPROVED PAYEES / 03</span>
                  <div className="ad-payee-row"><i>01</i><span><strong>Kora Systems</strong><small>LAGOS / NG</small></span><b>18,400</b></div>
                  <div className="ad-payee-row"><i>02</i><span><strong>Estudio Norte</strong><small>BUENOS AIRES / AR</small></span><b>12,650</b></div>
                  <div className="ad-payee-row"><i>03</i><span><strong>Pacifica Labs</strong><small>MANILA / PH</small></span><b>16,800</b></div>
                  <div className="ad-control-total"><span>CONTROL TOTAL</span><strong>47,850 USDC</strong></div>
                </div>

                <div className={`ad-register-screen ad-private-screen ${activeFrame === 2 ? "active" : ""}`}>
                  <span className="ad-screen-label">CONTROLLED DISCLOSURE</span>
                  <h3>Payment details stay under the veil.</h3>
                  <div className="ad-redacted-line"><span>PAYEE</span><i /></div>
                  <div className="ad-redacted-line"><span>VALUE</span><i className="short" /></div>
                  <div className="ad-redacted-line"><span>ASSET</span><i /></div>
                  <div className="ad-wallet-boundary"><span>WALLET BOUNDARY</span><strong>Proof stays in the wallet</strong></div>
                  <div className="ad-receipt-ready">RECEIPT READY <span>✓</span></div>
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
            <h2 id="privacy-boundary-title">The payment is private.<br />The limits are clear.</h2>
          </div>
          <div className="ad-boundary-list">
            <article><span>A / CONCEALED</span><strong>Payees, values, and payment relationships</strong></article>
            <article><span>B / STILL VISIBLE</span><strong>Pool activity, timing, and public deposit or withdrawal legs</strong></article>
          </div>
          <p className="ad-boundary-note">VeilAP never asks for your private key or viewing key. A compatible wallet prepares the proof and shows every signature.</p>
        </section>

      </main>

      <footer className="veil-footer">
        <div className="veil-footer-top">
          <div className="veil-footer-brand">
            <VeilLogo />
            <p>Private payment control for global teams.</p>
          </div>
          <nav className="veil-footer-links" aria-label="Footer navigation">
            <a href="#top">How it works</a>
            <a href="#privacy">Privacy model</a>
            <Link href="/workspace">Workspace</Link>
            <Link href="/sign-in">Sign in</Link>
          </nav>
          <div className="veil-footer-meta">
            <span>STARKNET / STRK20</span>
            <span>PRIVATE BY DEFAULT</span>
          </div>
        </div>
        <div className="veil-footer-bottom">
          <p>VeilAP is preview software. Payment details are concealed, while compatible wallets keep the proof and signature flow visible.</p>
          <small>© 2026 VeilAP. Built for private finance.</small>
        </div>
      </footer>
    </div>
  );
}
