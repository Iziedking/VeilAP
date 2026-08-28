import type { STRK20_CALL_AND_PROOF } from "starknet";

import { confirmStrk20Transaction, type ReceiptTraceProvider } from "./receipt";
import type { PoolFeeResult } from "./pool-fee";
import type { Strk20Action, Strk20Outcome } from "./types";

export interface Strk20WalletAccount {
  address: string;
  strk20PrepareInvoke(actions: Strk20Action[], simulate?: boolean): Promise<STRK20_CALL_AND_PROOF>;
  strk20InvokeTransaction(actions: Strk20Action[]): Promise<{ transaction_hash: string }>;
}

export interface Strk20AdapterDependencies {
  account: Strk20WalletAccount;
  poolAddress: string;
  readPoolFee: () => Promise<PoolFeeResult>;
  receiptProvider: ReceiptTraceProvider;
}

export interface PrivateTransferInput {
  token: string;
  amountMinor: string;
  recipient: string;
}

export interface ShieldInput {
  token: string;
  amountMinor: string;
}

export class Strk20WalletAdapter {
  private readonly account: Strk20WalletAccount;
  private readonly poolAddress: string;
  private readonly readPoolFee: () => Promise<PoolFeeResult>;
  private readonly receiptProvider: ReceiptTraceProvider;

  constructor(dependencies: Strk20AdapterDependencies) {
    this.account = dependencies.account;
    this.poolAddress = dependencies.poolAddress;
    this.readPoolFee = dependencies.readPoolFee;
    this.receiptProvider = dependencies.receiptProvider;
  }

  async preparePrivateTransfer(input: PrivateTransferInput): Promise<Strk20Outcome> {
    if (!validateAmount(input.amountMinor) || !hasValue(input.token) || !hasValue(input.recipient)) {
      return { kind: "error", code: "PREPARATION_FAILED" };
    }
    const actions = createPrivateTransferActions(input);
    return this.prepare(actions);
  }

  async prepareShield(input: ShieldInput): Promise<Strk20Outcome> {
    if (!validateAmount(input.amountMinor) || !hasValue(input.token)) {
      return { kind: "error", code: "PREPARATION_FAILED" };
    }
    const actions = createShieldActions(input);
    return this.prepare(actions);
  }

  async submit(actions: Strk20Action[]): Promise<Strk20Outcome> {
    try {
      const result = await this.account.strk20InvokeTransaction(actions);
      if (!result.transaction_hash) return { kind: "error", code: "SUBMISSION_FAILED" };
      return { kind: "submitted", transactionHash: result.transaction_hash };
    } catch (error) {
      return mapWalletError(error, "SUBMISSION_FAILED");
    }
  }

  async confirm(transactionHash: string): Promise<Strk20Outcome> {
    return confirmStrk20Transaction(
      this.receiptProvider,
      { transactionHash, poolAddress: this.poolAddress },
    );
  }

  private async prepare(actions: Strk20Action[]): Promise<Strk20Outcome> {
    const fee = await this.readPoolFee();
    if (!fee.ok) return { kind: "error", code: "PREPARATION_FAILED" };
    try {
      // starknet@10.4.0, WalletAccountV6.strk20PrepareInvoke in
      // node_modules/starknet/dist/index.d.ts, read 2026-08-28. Simulation
      // is used for preflight only; submit() is the separate user action.
      const callAndProof = await this.account.strk20PrepareInvoke(actions, true);
      return { kind: "prepared", liveFee: fee.value.feeMinor, callAndProof };
    } catch (error) {
      return mapWalletError(error, "PREPARATION_FAILED");
    }
  }
}

export function createPrivateTransferActions(input: PrivateTransferInput): Strk20Action[] {
  return [{
    type: "transfer",
    token: input.token,
    amount: input.amountMinor,
    recipient: input.recipient,
  }];
}

export function createShieldActions(input: ShieldInput): Strk20Action[] {
  return [{
    type: "deposit",
    token: input.token,
    amount: input.amountMinor,
  }];
}

function validateAmount(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

function mapWalletError(
  error: unknown,
  fallback: "PREPARATION_FAILED" | "SUBMISSION_FAILED",
): Strk20Outcome {
  const text = errorText(error).toLowerCase();
  if (/(user|request|transaction).*(reject|denied|cancel)|reject|denied|cancelled/.test(text)) {
    return { kind: "user_rejected" };
  }
  if (/(recipient|viewing key|registration).*(missing|required|not found|not registered)|not registered/.test(text)) {
    return { kind: "recipient_not_ready" };
  }
  return { kind: "error", code: fallback };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return "";
  const record = error as Record<string, unknown>;
  return [record.code, record.message, record.reason]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}
