"use client";

import { useState } from "react";

import {
  createShieldActions,
  Strk20WalletAdapter,
  type ShieldInput,
} from "@/lib/strk20/adapter";
import type { Strk20Outcome } from "@/lib/strk20/types";
import type { Strk20WalletAccount } from "@/lib/strk20/adapter";
import { createClientReceiptProvider, readLivePoolFee } from "./strk20-desk-utils";

export function ShieldDesk({
  account,
  poolAddress,
  token,
}: {
  account: Strk20WalletAccount | null;
  poolAddress: string;
  token: string;
}) {
  const [amountMinor, setAmountMinor] = useState("1000000");
  const [outcome, setOutcome] = useState<Strk20Outcome | null>(null);
  const [actions, setActions] = useState<ShieldInput | null>(null);
  const [busy, setBusy] = useState(false);

  async function prepare() {
    if (!account) return;
    setBusy(true);
    const adapter = createAdapter(account, poolAddress);
    const input = { token, amountMinor };
    const result = await adapter.prepareShield(input);
    setOutcome(result);
    if (result.kind === "prepared") setActions(input);
    setBusy(false);
  }

  async function submit() {
    if (!account || !actions) return;
    setBusy(true);
    const result = await createAdapter(account, poolAddress).submit(createShieldActions(actions));
    setOutcome(result);
    setBusy(false);
  }

  const submitted = outcome?.kind === "submitted";
  return (
    <section className="strk20-desk" aria-labelledby="shield-title">
      <div className="strk20-desk-heading">
        <span>PRIVATE FUNDING / 01</span>
        <strong id="shield-title">Shield funds</strong>
      </div>
      <p>Move public tokens into your private balance. VeilAP never combines this deposit with a milestone release.</p>
      <label>
        Amount in token units
        <input inputMode="numeric" value={amountMinor} onChange={(event) => setAmountMinor(event.target.value)} />
      </label>
      <div className="strk20-desk-actions">
        <button type="button" disabled={!account || busy || submitted} onClick={prepare}>
          {busy ? "CHECKING FEE" : "CHECK LIVE FEE"}
          <span aria-hidden="true">→</span>
        </button>
        <button type="button" disabled={!account || busy || !actions || submitted} onClick={submit}>
          APPROVE AND SHIELD
        </button>
      </div>
      {!account ? <small>Connect a compatible private wallet to open this desk. No wallet request happens here.</small> : null}
      {outcome ? <OutcomeMessage outcome={outcome} /> : <small>After confirmation, wait about ten blocks before spending the new private note.</small>}
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
  if (outcome.kind === "user_rejected") return <small>The wallet request was declined. No private deposit was submitted.</small>;
  if (outcome.kind === "error") return <small>Preparation could not continue. Check the wallet and try again.</small>;
  return <small>Wallet state: {outcome.kind}.</small>;
}
