"use client";

import { useState } from "react";

import {
  createPrivateTransferActions,
  Strk20WalletAdapter,
  type PrivateTransferInput,
  type Strk20WalletAccount,
} from "@/lib/strk20/adapter";
import type { Strk20Outcome } from "@/lib/strk20/types";
import { createClientReceiptProvider, readLivePoolFee } from "./strk20-desk-utils";

export function PrivateTransferDesk({
  account,
  poolAddress,
  token,
}: {
  account: Strk20WalletAccount | null;
  poolAddress: string;
  token: string;
}) {
  const [amountMinor, setAmountMinor] = useState("47850000000");
  const [recipient, setRecipient] = useState("");
  const [outcome, setOutcome] = useState<Strk20Outcome | null>(null);
  const [transfer, setTransfer] = useState<PrivateTransferInput | null>(null);
  const [busy, setBusy] = useState(false);

  async function prepare() {
    if (!account || !recipient.trim()) return;
    setBusy(true);
    const adapter = createAdapter(account, poolAddress);
    const input = { token, amountMinor, recipient: recipient.trim() };
    const result = await adapter.preparePrivateTransfer(input);
    setOutcome(result);
    if (result.kind === "prepared") setTransfer(input);
    setBusy(false);
  }

  async function submit() {
    if (!account || !transfer) return;
    setBusy(true);
    const result = await createAdapter(account, poolAddress).submit(createPrivateTransferActions(transfer));
    setOutcome(result);
    setBusy(false);
  }

  const submitted = outcome?.kind === "submitted";
  return (
    <section className="strk20-desk" aria-labelledby="private-transfer-title">
      <div className="strk20-desk-heading">
        <span>PRIVATE SETTLEMENT / 02</span>
        <strong id="private-transfer-title">Send privately</strong>
      </div>
      <p>Send a prepared milestone amount to a registered recipient without publishing the amount or relationship.</p>
      <label>
        Recipient address
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x..." />
      </label>
      <label>
        Amount in token units
        <input inputMode="numeric" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} />
      </label>
      <div className="strk20-desk-actions">
        <button type="button" disabled={!account || busy || !recipient.trim() || submitted} onClick={prepare}>
          {busy ? "CHECKING FEE" : "CHECK LIVE FEE"}
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" disabled={!account || busy || !transfer || submitted} onClick={submit}>
          REVIEW PRIVATE SEND
        </button>
      </div>
      {!account ? <small>Connect a compatible private wallet to open this desk. No wallet request happens here.</small> : null}
      {outcome ? <OutcomeMessage outcome={outcome} /> : <small>The recipient must be registered for private transfers before a wallet prompt can proceed.</small>}
    </section>
  );
}

function createAdapter(account: Strk20WalletAccount, poolAddress: string) {
  return new Strk20WalletAdapter({
    account,
    poolAddress,
    readPoolFee: readLivePoolFee,
    receiptProvider: createClientReceiptProvider(),
  });
}

function OutcomeMessage({ outcome }: { outcome: Strk20Outcome }) {
  if (outcome.kind === "prepared") return <small>Live pool fee: {outcome.liveFee} minor units. Review the wallet prompts before continuing.</small>;
  if (outcome.kind === "submitted") return <small>Submitted for confirmation: {outcome.transactionHash}</small>;
  if (outcome.kind === "recipient_not_ready") return <small>The recipient is not ready for a private transfer.</small>;
  if (outcome.kind === "user_rejected") return <small>The wallet request was declined. No private transfer was submitted.</small>;
  if (outcome.kind === "error") return <small>Preparation could not continue. Check the wallet and try again.</small>;
  return <small>Wallet state: {outcome.kind}.</small>;
}
