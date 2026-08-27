"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { VeilLogo } from "@/components/veil-logo";

type Invoice = {
  id: string;
  supplier: string;
  location: string;
  countryCode: string;
  due: string;
  amount: number;
  category: string;
  status: "Approved" | "Review";
};

const invoices: readonly Invoice[] = [
  { id: "INV-2084", supplier: "Kora Systems", location: "Lagos, Nigeria", countryCode: "NG", due: "29 AUG", amount: 18400, category: "Infrastructure", status: "Approved" },
  { id: "INV-2087", supplier: "Estudio Norte", location: "Buenos Aires, Argentina", countryCode: "AR", due: "30 AUG", amount: 12650, category: "Product design", status: "Approved" },
  { id: "INV-2091", supplier: "Pacifica Labs", location: "Manila, Philippines", countryCode: "PH", due: "31 AUG", amount: 16800, category: "Engineering", status: "Approved" },
  { id: "INV-2094", supplier: "Sable Advisory", location: "Nairobi, Kenya", countryCode: "KE", due: "03 SEP", amount: 7200, category: "Compliance", status: "Review" },
] as const;

const initialSelection = new Set(invoices.slice(0, 3).map((invoice) => invoice.id));

function formatUsdc(amount: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function VeilApDashboard() {
  const [selectedIds, setSelectedIds] = useState(initialSelection);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [walletNotice, setWalletNotice] = useState(false);

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => selectedIds.has(invoice.id)),
    [selectedIds],
  );
  const selectedTotal = selectedInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  function toggleInvoice(invoice: Invoice) {
    if (invoice.status !== "Approved") return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(invoice.id)) next.delete(invoice.id);
      else next.add(invoice.id);
      return next;
    });
  }

  function showWalletNotice() {
    setWalletNotice(true);
    window.setTimeout(() => setWalletNotice(false), 3400);
  }

  return (
    <div className="site-frame">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="VeilAP home">
          <VeilLogo />
        </Link>
        <div className="office-title">
          <span>Northline Operations Ltd.</span>
          <strong>Confidential settlement office</strong>
        </div>
        <div className="network-register">
          <span className="registration-dot" aria-hidden="true" />
          <div><span>NETWORK</span><strong>SN_MAIN</strong></div>
        </div>
      </header>

      <nav className="folio-nav" aria-label="Workspace sections">
        <a className="current" href="#run">01 / PAYMENT RUN</a>
        <a href="#register">02 / REGISTER</a>
        <a href="#privacy">03 / DISCLOSURE</a>
        <a href="#receipt">04 / RECEIPT</a>
        <button type="button" onClick={showWalletNotice}>CONNECT PRIVATE WALLET</button>
      </nav>

      <div className="preview-ribbon" role="note">
        <span>PREVIEW RECORD</span>
        Synthetic counterparties and values. No wallet connected. No funds moved.
      </div>

      <main id="top" className="ledger-page">
        <section id="run" className="run-heading" aria-labelledby="run-title">
          <div className="run-kicker"><span>DOCUMENT</span><strong>AP-0827</strong></div>
          <div className="run-title-block">
            <p>Private payment run / August 2026</p>
            <h1 id="run-title">Release register</h1>
            <p className="run-description">Three approved supplier obligations prepared for private USDC settlement. Final execution remains inside the signer&apos;s wallet.</p>
          </div>
          <dl className="run-totals">
            <div><dt>Prepared</dt><dd>27 AUG 2026 / 14:10 UTC</dd></div>
            <div><dt>Release asset</dt><dd>USDC</dd></div>
            <div className="total-line"><dt>Selected value</dt><dd>{formatUsdc(selectedTotal)} <small>USDC</small></dd></div>
          </dl>
        </section>

        <section className="document-grid">
          <div id="register" className="register-sheet">
            <div className="sheet-caption">
              <div><span>PAYABLES LEDGER</span><strong>AUTHORIZED RELEASE QUEUE</strong></div>
              <p>{selectedInvoices.length.toString().padStart(2, "0")} / 04 selected</p>
            </div>

            <div className="register-table" role="table" aria-label="Supplier payment register">
              <div className="register-row register-columns" role="row">
                <span role="columnheader">LINE</span><span role="columnheader">RELEASE</span><span role="columnheader">COUNTERPARTY / PURPOSE</span><span role="columnheader">REFERENCE</span><span role="columnheader">DUE</span><span role="columnheader">VALUE</span>
              </div>
              {invoices.map((invoice, index) => {
                const checked = selectedIds.has(invoice.id);
                const locked = invoice.status !== "Approved";
                return (
                  <div className={`register-row ${checked ? "is-selected" : ""} ${locked ? "is-locked" : ""}`} role="row" key={invoice.id}>
                    <span className="line-number" role="cell">{String(index + 1).padStart(2, "0")}</span>
                    <span role="cell">
                      <label className="ledger-check">
                        <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleInvoice(invoice)} />
                        <span aria-hidden="true">{checked ? "×" : ""}</span>
                        <span className="sr-only">Select {invoice.id}</span>
                      </label>
                    </span>
                    <span className="counterparty" role="cell"><strong>{invoice.supplier}</strong><small>{invoice.location} / {invoice.category}</small></span>
                    <span className="reference" role="cell"><strong>{invoice.id}</strong><small>{invoice.countryCode} / {invoice.status.toUpperCase()}</small></span>
                    <span className="due-date" role="cell">{invoice.due}</span>
                    <span className="ledger-amount" role="cell"><strong>{formatUsdc(invoice.amount)}</strong><small>USDC</small></span>
                  </div>
                );
              })}
            </div>

            <div className="register-total"><span>CONTROL TOTAL / SELECTED LINES</span><strong>{formatUsdc(selectedTotal)} <small>USDC</small></strong></div>
            <div className="authorization-track" aria-label="Payment run progress">
              <div className="track-step done"><span>01</span><strong>PREPARED</strong><small>Invoice control passed</small></div>
              <div className="track-step active"><span>02</span><strong>REVIEW</strong><small>Human release check</small></div>
              <div className="track-step"><span>03</span><strong>SIGN</strong><small>Wallet confirmation</small></div>
              <div className="track-step"><span>04</span><strong>RECONCILE</strong><small>Receipt and state</small></div>
            </div>
          </div>

          <aside id="privacy" className="disclosure-sheet" aria-labelledby="disclosure-title">
            <div className="sheet-index">PRIVACY<br/>DISCLOSURE<br/>03</div>
            <p className="disclosure-code">STRK20 / WALLET ROUTE</p>
            <h2 id="disclosure-title">A sealed transfer is not an invisible transfer.</h2>
            <div className="redaction-sample" aria-hidden="true"><span>PAYEE</span><i /><span>VALUE</span><i className="short" /><span>ASSET</span><i /></div>
            <div className="disclosure-block concealed">
              <span>A / CONCEALED IN POOL</span>
              <ul><li>Sender and recipient relationship</li><li>Transfer value and token</li><li>Private note graph</li></ul>
            </div>
            <div className="disclosure-block observable">
              <span>B / PUBLIC OR CORRELATABLE</span>
              <ul><li>Pool interaction and timing</li><li>Shield and unshield token legs</li><li>Records disclosed by either party</li></ul>
            </div>
            <div className="pool-register"><span>POOL REGISTER</span><code>0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a</code></div>
            <p className="disclosure-note">Viewing keys and proof generation stay in the compatible wallet. VeilAP never asks for either key.</p>
          </aside>
        </section>

        <section id="receipt" className="release-footer">
          <div className="signatory-lines">
            <div><span>PREPARED BY</span><strong>AMARA MENSAH</strong><i /></div>
            <div><span>RELEASE AUTHORITY</span><strong>AWAITING SIGNER</strong><i /></div>
          </div>
          <div className="release-action">
            <div><span>FINAL CONTROL</span><strong>{selectedInvoices.length} LINES / {formatUsdc(selectedTotal)} USDC</strong><small>Live fee is read before signature.</small></div>
            <button type="button" onClick={() => setReviewOpen(true)} disabled={selectedInvoices.length === 0}>REVIEW FOR RELEASE <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <footer className="document-footer"><span>VEILAP / CONFIDENTIAL ACCOUNTS PAYABLE</span><span>PAGE 01 OF 01</span><span>PREVIEW / NOT A PAYMENT RECEIPT</span></footer>
      </main>

      {walletNotice ? <div className="notice-ticket" role="status"><span>WALLET INTERFACE / PENDING</span><strong>No access was requested.</strong><p>The current build is a payment-register preview.</p></div> : null}

      {reviewOpen ? (
        <div className="authorization-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}>
          <section className="authorization-sheet" role="dialog" aria-modal="true" aria-labelledby="authorization-title">
            <header><div><span>RELEASE AUTHORIZATION</span><strong>AP-0827 / {selectedInvoices.length.toString().padStart(2, "0")} LINES</strong></div><button type="button" onClick={() => setReviewOpen(false)} aria-label="Close authorization">CLOSE ×</button></header>
            <div className="authorization-title"><p>CONTROL COPY / PREVIEW</p><h2 id="authorization-title">Confirm the register before the wallet sees it.</h2></div>
            <div className="authorization-register">
              {selectedInvoices.map((invoice, index) => <div key={invoice.id}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{invoice.supplier}</strong><small>{invoice.id} / {invoice.countryCode}</small></span><strong>{formatUsdc(invoice.amount)} USDC</strong></div>)}
              <div className="authorization-total"><span>CONTROL TOTAL</span><strong>{formatUsdc(selectedTotal)} USDC</strong></div>
            </div>
            <dl className="authorization-facts"><div><dt>NETWORK</dt><dd>STARKNET MAINNET</dd></div><div><dt>SETTLEMENT</dt><dd>PRIVATE TRANSFER</dd></div><div><dt>POOL FEE</dt><dd>READ LIVE BEFORE SIGNING</dd></div><div><dt>APPLICATION CUSTODY</dt><dd>NONE</dd></div></dl>
            <div className="wallet-boundary"><span>WALLET BOUNDARY</span><p>The compatible wallet prepares the proof, displays each required signature, and submits. VeilAP does not receive viewing keys or private keys.</p></div>
            <div className="authorization-actions"><button className="back-button" type="button" onClick={() => setReviewOpen(false)}>RETURN TO REGISTER</button><button className="release-button" type="button" onClick={showWalletNotice}>CONNECT WALLET / INSPECT FEE</button></div>
            <p className="authorization-disclaimer">No transaction is created in preview mode. A payment will not be marked complete from a transaction hash alone.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
