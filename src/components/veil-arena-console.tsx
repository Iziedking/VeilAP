"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { TypedData } from "starknet";

import { VeilLogo } from "@/components/veil-logo";
import {
  buildArenaTransferAuthorizationTypedData,
  createArenaTransferAuthorization,
  type ArenaTransferPlan,
} from "@/domain/arena/transfer-authorization";
import { apiFetch } from "@/lib/api/client";
import {
  createPrivateTransferActions,
  createShieldActions,
  Strk20WalletAdapter,
  type Strk20WalletAccount,
} from "@/lib/strk20/adapter";
import type { Strk20Outcome } from "@/lib/strk20/types";
import { connectSessionWallet, type WalletStandardWallet } from "@/lib/wallet/account";
import { useDiscoveredWallets } from "@/lib/wallet/wallet-store";
import { createClientReceiptProvider, readLivePoolFee } from "@/components/wallet/strk20-desk-utils";
import { WalletPicker } from "@/components/wallet/wallet-picker";

type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; code: string };

type Season = {
  id: string;
  projectId: string;
  name: string;
  rulesetVersion: string;
  startsAt: string;
  locksAt: string;
  endsAt: string;
  status: "open" | "locked" | "completed" | "cancelled";
  entryMode: "invite_only" | "open";
  maxEntries: number;
  entryCount: number;
  prizeStatus?: "funding_pending" | "funded" | "settlement_pending" | "settled" | "unknown";
  createdAt: string;
  lockedAt?: string;
};

type Strategy = {
  id: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  status: "sealed";
  createdAt: string;
};

type Entry = {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  joinedAt: string;
};

type ScheduledMatch = {
  id: string;
  seasonId: string;
  sequence: number;
  hands: number;
  leftAgentId: string;
  rightAgentId: string;
  status: "scheduled" | "running" | "completed" | "failed";
  matchId?: string;
  createdAt: string;
};

type Schedule = {
  season: Season;
  entries: Entry[];
  matches: ScheduledMatch[];
};

type PublicMatch = {
  matchId: string;
  players: Array<{ agentId: string; displayName: string }>;
  score: Record<string, number>;
  transcriptRoot: string;
  signedReceipt?: { publicKeyId: string };
};

type PrizePool = {
  id: string;
  projectId: string;
  seasonId: string;
  tokenAddress: string;
  tokenSymbol: string;
  poolAddress: string;
  amountMinor: string;
  status: "funding_pending" | "funded" | "settlement_pending" | "settled" | "unknown";
  fundingTransactionHash?: string;
  fundingReceiptDigest?: string;
  winnerAgentId?: string;
  recipientFingerprint?: string;
  settlementTransactionHash?: string;
  settlementReceiptDigest?: string;
};

type FundingPlan = ArenaTransferPlan;

type FundingAccount = Strk20WalletAccount & {
  signMessage(typedData: TypedData): Promise<unknown>;
  unsubscribeChange?: () => void;
};

const errorCopy: Record<string, string> = {
  AUTH_REQUIRED: "Sign in with the operator wallet before using the arena desk.",
  PROJECT_ACCESS_REQUIRED: "This wallet does not have access to the project.",
  ROLE_FORBIDDEN: "This action is restricted to a company or reviewer role.",
  PROJECT_NOT_FOUND: "That project was not found in the connected database.",
  ARENA_SEASON_NOT_FOUND: "That season no longer exists.",
  ARENA_SEASON_TOO_SMALL: "Register at least two sealed agents before locking.",
  ARENA_SEASON_ALREADY_LOCKED: "This season is already locked.",
  ARENA_SEASON_NOT_LOCKED: "Lock the season before running a scheduled pairing.",
  ARENA_SEASON_NOT_ACTIVE: "A prize pool can only be created while the season is open or locked.",
  ARENA_SEASON_FULL: "This season has reached its entry limit.",
  ARENA_WALLET_ALREADY_ENTERED: "This wallet already has an agent in the season.",
  ARENA_PRIZE_POOL_NOT_FOUND: "No prize pool has been created for this season.",
  ARENA_PRIZE_POOL_ALREADY_EXISTS: "This season already has a prize pool.",
  ARENA_PRIZE_POOL_ALREADY_FUNDED: "Sponsor funding is already recorded for this pool.",
  ARENA_PRIZE_POOL_NOT_FUNDED: "Confirm the sponsor funding transaction before preparing a settlement.",
  ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY: "Prepare the winner settlement before confirming its transaction.",
  ARENA_PRIZE_POOL_ALREADY_SETTLED: "This prize pool has already been settled.",
  ARENA_MATCH_NOT_COMPLETE: "Every scheduled pairing must finish before a winner can be settled.",
  ARENA_WINNER_TIE: "The season has no unique winner yet. Resolve the tie before settling.",
  ARENA_WINNER_PAYOUT_NOT_REGISTERED: "The winning agent has no verified payout wallet. Do not prepare a manual replacement.",
  TRANSACTION_NOT_CONFIRMED: "The Starknet receipt is not confirmed for the configured STRK20 pool yet.",
  FUNDING_PLAN_FAILED: "The sponsor reserve plan could not be prepared.",
  FUNDING_PLAN_CHANGED: "The sponsor reserve changed. Review the refreshed shield action before continuing.",
  SETTLEMENT_PLAN_FAILED: "The private payout plan could not be recovered.",
  SETTLEMENT_PLAN_CHANGED: "The private payout changed. Review the refreshed recipient and amount before continuing.",
  ARENA_SPONSOR_WALLET_REQUIRED: "Use the same sponsor wallet that created this prize record.",
  TRANSFER_AUTHORIZATION_EXPIRED: "This authorization expired. Review the current plan and sign it again.",
  TRANSFER_PLAN_MISMATCH: "The signed transfer does not match the current reward plan. Review the refreshed plan.",
  SIGNATURE_INVALID: "The sponsor signature could not be verified for this transfer.",
  SIGNATURE_UNAVAILABLE: "Wallet signature verification is temporarily unavailable.",
  ARENA_SCHEDULED_MATCH_IN_PROGRESS: "Another operator is already running this pairing.",
  STRATEGY_ARTIFACT_NOT_FOUND: "That sealed strategy artifact was not found.",
  ARENA_SEASON_ENTRY_ALREADY_EXISTS: "This agent is already registered in the season.",
  IDEMPOTENCY_KEY_REUSED: "The request key was already used for different input.",
  CONFIGURATION_MISSING: "The persisted server security configuration is incomplete.",
};

function freshKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function shortCommitment(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : value;
}

function toIso(value: string): string | undefined {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function friendlyError(code: string): string {
  return errorCopy[code] ?? `The arena server returned ${code}.`;
}

function signatureStrings(signature: unknown): string[] {
  if (Array.isArray(signature)) return signature.map(String);
  if (signature && typeof signature === "object") {
    const value = signature as { r?: unknown; s?: unknown };
    if (value.r !== undefined && value.s !== undefined) {
      return [String(value.r), String(value.s)];
    }
  }
  throw new Error("SIGNATURE_FORMAT_UNSUPPORTED");
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  return await response.json() as ApiEnvelope<T>;
}

export function VeilArenaConsole() {
  const wallets = useDiscoveredWallets();
  const [projectId, setProjectId] = useState("");
  const [projectInput, setProjectInput] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("project")?.trim() ?? "");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [latestMatch, setLatestMatch] = useState<PublicMatch | null>(null);
  const [prizePool, setPrizePool] = useState<PrizePool | null>(null);
  const [fundingPlan, setFundingPlan] = useState<FundingPlan | null>(null);
  const [fundingAccount, setFundingAccount] = useState<FundingAccount | null>(null);
  const [fundingWalletName, setFundingWalletName] = useState("");
  const [fundingPrepared, setFundingPrepared] = useState(false);
  const [fundingWalletOutcome, setFundingWalletOutcome] = useState<Strk20Outcome | null>(null);
  const [settlementPlan, setSettlementPlan] = useState<FundingPlan | null>(null);
  const [settlementPrepared, setSettlementPrepared] = useState(false);
  const [settlementWalletOutcome, setSettlementWalletOutcome] = useState<Strk20Outcome | null>(null);
  const [seasonName, setSeasonName] = useState("");
  const [rulesetVersion, setRulesetVersion] = useState("holdem-v1");
  const [startsAt, setStartsAt] = useState("");
  const [locksAt, setLocksAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [entryMode, setEntryMode] = useState<Season["entryMode"]>("open");
  const [maxEntries, setMaxEntries] = useState("16");
  const [hands, setHands] = useState("18");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("USDC");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [fundingHash, setFundingHash] = useState("");
  const [settlementHash, setSettlementHash] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const openSeasons = useMemo(() => seasons.filter((season) => season.status === "open"), [seasons]);
  const lockedMatches = schedule?.matches ?? [];

  useEffect(() => () => fundingAccount?.unsubscribeChange?.(), [fundingAccount]);

  const loadProject = useCallback(async (nextProjectId: string) => {
    const normalized = nextProjectId.trim();
    if (!normalized) {
      setError("Enter the real project ID before loading the operator desk.");
      return;
    }
    setBusy("load");
    setError("");
    setNotice("");
    setSchedule(null);
    setLatestMatch(null);
    setPrizePool(null);
    setFundingPlan(null);
    setFundingPrepared(false);
    setFundingWalletOutcome(null);
    setSettlementPlan(null);
    setSettlementPrepared(false);
    setSettlementWalletOutcome(null);
    try {
      const [seasonResponse, strategyResponse] = await Promise.all([
        apiFetch(`/api/projects/${encodeURIComponent(normalized)}/seasons`),
        apiFetch(`/api/projects/${encodeURIComponent(normalized)}/strategies`),
      ]);
      const seasonBody = await readEnvelope<Season[]>(seasonResponse);
      const strategyBody = await readEnvelope<Strategy[]>(strategyResponse);
      if (!seasonResponse.ok || !seasonBody.ok) {
        setError(friendlyError(seasonBody.ok ? "SEASONS_UNAVAILABLE" : seasonBody.code));
        return;
      }
      if (!strategyResponse.ok || !strategyBody.ok) {
        setError(friendlyError(strategyBody.ok ? "STRATEGIES_UNAVAILABLE" : strategyBody.code));
        return;
      }
      setProjectId(normalized);
      setProjectInput(normalized);
      setSeasons(seasonBody.value);
      setStrategies(strategyBody.value);
      setNotice(`${seasonBody.value.length} season${seasonBody.value.length === 1 ? "" : "s"} and ${strategyBody.value.length} sealed strateg${strategyBody.value.length === 1 ? "y" : "ies"} loaded.`);
    } catch {
      setError("The arena server could not be reached.");
    } finally {
      setBusy("");
    }
  }, []);

  async function loadSchedule(seasonId: string) {
    setBusy("schedule");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}`);
      const body = await readEnvelope<Schedule>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SCHEDULE_UNAVAILABLE" : body.code));
        return;
      }
      setSchedule(body.value);
      setSelectedAgents(body.value.entries.map((entry) => entry.agentId));
      await loadPrizePool(seasonId);
    } catch {
      setError("The season schedule could not be reached.");
    } finally {
      setBusy("");
    }
  }

  async function loadPrizePool(seasonId: string) {
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}/prize-pool`);
      const body = await readEnvelope<PrizePool>(response);
      if (response.status === 404 && !body.ok && body.code === "ARENA_PRIZE_POOL_NOT_FOUND") {
        setPrizePool(null);
        setFundingPlan(null);
        setFundingPrepared(false);
        setFundingWalletOutcome(null);
        setSettlementPlan(null);
        setSettlementPrepared(false);
        setSettlementWalletOutcome(null);
        return;
      }
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "PRIZE_POOL_UNAVAILABLE" : body.code));
        return;
      }
      let nextSettlementPlan: FundingPlan | null = null;
      if (body.value.status === "settlement_pending") {
        const settlementResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}/prize-pool/settlement`);
        const settlementBody = await readEnvelope<FundingPlan>(settlementResponse);
        if (settlementResponse.ok && settlementBody.ok) nextSettlementPlan = settlementBody.value;
      }
      setPrizePool(body.value);
      setFundingPlan(null);
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setSettlementPlan(nextSettlementPlan);
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
    } catch {
      setError("The prize pool could not be reached.");
    }
  }

  async function createSeason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const starts = toIso(startsAt);
    const locks = toIso(locksAt);
    const ends = toIso(endsAt);
    const entryLimit = Number(maxEntries);
    if (!seasonName.trim() || !starts || !locks || !ends || !(starts < locks && locks < ends) || !Number.isInteger(entryLimit) || entryLimit < 2 || entryLimit > 32) {
      setError("Provide a name, an entry limit from 2 to 32, and dates in the order start, lock, end.");
      return;
    }
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("season") },
        body: JSON.stringify({ name: seasonName.trim(), rulesetVersion: rulesetVersion.trim(), startsAt: starts, locksAt: locks, endsAt: ends, entryMode, maxEntries: entryLimit }),
      });
      const body = await readEnvelope<Season>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SEASON_CREATE_FAILED" : body.code));
        return;
      }
      setSeasons((current) => [body.value, ...current.filter((season) => season.id !== body.value.id)]);
      setSeasonName("");
      setNotice(`Season ${body.value.name} created and ready for entries.`);
      await loadSchedule(body.value.id);
    } catch {
      setError("The season could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function registerSelectedAgents() {
    if (!schedule || selectedAgents.length === 0) return;
    setBusy("register");
    setError("");
    setNotice("");
    try {
      for (const agentId of selectedAgents) {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("entry") },
          body: JSON.stringify({ agentId }),
        });
        const body = await readEnvelope<Entry>(response);
        if (!response.ok || !body.ok) {
          setError(friendlyError(body.ok ? "ENTRY_FAILED" : body.code));
          return;
        }
      }
      setNotice(`${selectedAgents.length} sealed agent${selectedAgents.length === 1 ? "" : "s"} registered.`);
      await loadSchedule(schedule.season.id);
    } catch {
      setError("The selected agents could not be registered.");
    } finally {
      setBusy("");
    }
  }

  async function lockSeason() {
    if (!schedule) return;
    const handCount = Number(hands);
    if (!Number.isInteger(handCount) || handCount < 1 || handCount > 100) {
      setError("Hands must be a whole number from 1 to 100.");
      return;
    }
    setBusy("lock");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("lock") },
        body: JSON.stringify({ hands: handCount }),
      });
      const body = await readEnvelope<Schedule>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SEASON_LOCK_FAILED" : body.code));
        return;
      }
      setSchedule(body.value);
      setSeasons((current) => current.map((season) => season.id === body.value.season.id ? body.value.season : season));
      setNotice(`${body.value.matches.length} pairings scheduled. The season is locked.`);
    } catch {
      setError("The season could not be locked.");
    } finally {
      setBusy("");
    }
  }

  async function runMatch(match: ScheduledMatch) {
    if (!schedule) return;
    setBusy(`run-${match.id}`);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/matches/${encodeURIComponent(match.id)}/run`, {
        method: "POST",
        headers: { "Idempotency-Key": freshKey("match") },
      });
      const body = await readEnvelope<PublicMatch>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "MATCH_RUN_FAILED" : body.code));
        return;
      }
      setLatestMatch(body.value);
      setNotice(`${body.value.matchId} completed and the public receipt is ready.`);
      await loadSchedule(schedule.season.id);
    } catch {
      setError("The scheduled pairing could not be reached.");
    } finally {
      setBusy("");
    }
  }

  async function createPrizePool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schedule) return;
    setBusy("pool-create");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("pool") },
        body: JSON.stringify({ tokenAddress: tokenAddress.trim(), tokenSymbol: tokenSymbol.trim(), amountMinor: prizeAmount.trim() }),
      });
      const body = await readEnvelope<PrizePool>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "PRIZE_POOL_CREATE_FAILED" : body.code));
        return;
      }
      setPrizePool(body.value);
      setNotice("Sponsor pool created. Submit the funding transaction from the sponsor wallet, then paste its hash here.");
    } catch {
      setError("The sponsor pool could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function confirmFunding() {
    if (!schedule || !fundingPlan || !fundingAccount || !fundingHash.trim()) return;
    setBusy("pool-funding");
    setError("");
    setNotice("");
    try {
      let signature: string[];
      const authorization = createArenaTransferAuthorization(fundingPlan, fundingHash.trim());
      try {
        signature = signatureStrings(
          await fundingAccount.signMessage(buildArenaTransferAuthorizationTypedData(authorization)),
        );
      } catch {
        setNotice("The reserve authorization was declined or unavailable. No arena state was changed.");
        return;
      }
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool/funding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization, signature }),
      });
      const body = await readEnvelope<PrizePool>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "FUNDING_CONFIRM_FAILED" : body.code));
        return;
      }
      setPrizePool(body.value);
      setFundingHash("");
      setFundingPlan(null);
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setNotice("The sponsor reserve is verified by its wallet authorization and finalized STRK20 pool transaction.");
    } catch {
      setError("The funding receipt could not be checked.");
    } finally {
      setBusy("");
    }
  }

  async function prepareFundingPlan() {
    if (!schedule) return;
    setBusy("pool-plan");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool/funding`);
      const body = await readEnvelope<FundingPlan>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "FUNDING_PLAN_FAILED" : body.code));
        return;
      }
      setFundingPlan(body.value);
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setNotice("Review this exact shield action in the sponsor wallet, then submit and authorize its transaction hash.");
    } catch {
      setError("The funding plan could not be reached.");
    } finally {
      setBusy("");
    }
  }

  async function connectFundingWallet(wallet: WalletStandardWallet) {
    setBusy("funding-wallet");
    setError("");
    setNotice("");
    setFundingWalletOutcome(null);
    try {
      const result = await connectSessionWallet(wallet);
      if (result.kind === "unsupported") {
        setError(`This wallet needs STRK20 Wallet API ${result.minimum} or newer.`);
        return;
      }
      if (result.kind === "wrong-network") {
        setError("Switch the sponsor wallet to Starknet Mainnet, then try again.");
        return;
      }
      setFundingAccount(result.account);
      setFundingWalletName(wallet.name);
      setFundingPrepared(false);
      setNotice(`${wallet.name} is ready. Review the exact shield or payout action before requesting a wallet prompt.`);
    } catch {
      setError("The sponsor wallet could not be connected.");
    } finally {
      setBusy("");
    }
  }

  async function prepareWalletFunding() {
    if (!fundingAccount || !fundingPlan || !prizePool) return;
    setBusy("funding-prepare");
    setError("");
    setNotice("");
    const currentResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(prizePool.seasonId)}/prize-pool/funding`);
    const currentBody = await readEnvelope<FundingPlan>(currentResponse);
    if (!currentResponse.ok || !currentBody.ok) {
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setError(friendlyError(currentBody.ok ? "FUNDING_PLAN_FAILED" : currentBody.code));
      setBusy("");
      return;
    }
    if (!sameFundingPlan(fundingPlan, currentBody.value)) {
      setFundingPlan(currentBody.value);
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setNotice("The sponsor reserve changed. Review the refreshed shield action before continuing.");
      setBusy("");
      return;
    }
    const result = await createFundingAdapter(fundingAccount, prizePool.poolAddress).prepareShield({
      token: fundingPlan.tokenAddress,
      amountMinor: fundingPlan.amountMinor,
    });
    setFundingWalletOutcome(result);
    setFundingPrepared(result.kind === "prepared");
    setNotice(result.kind === "prepared" ? "The reserve shield passed wallet preflight. Submit only after reviewing the wallet prompt." : "Wallet preflight did not pass. No reserve transaction was submitted.");
    setBusy("");
  }

  async function submitWalletFunding() {
    if (!fundingAccount || !fundingPlan || !prizePool || !fundingPrepared) return;
    setBusy("funding-submit");
    setError("");
    setNotice("");
    const currentResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(prizePool.seasonId)}/prize-pool/funding`);
    const currentBody = await readEnvelope<FundingPlan>(currentResponse);
    if (!currentResponse.ok || !currentBody.ok || !sameFundingPlan(fundingPlan, currentBody.value)) {
      if (currentBody.ok) setFundingPlan(currentBody.value);
      setFundingPrepared(false);
      setFundingWalletOutcome(null);
      setError(friendlyError(currentBody.ok ? "FUNDING_PLAN_CHANGED" : currentBody.code));
      setBusy("");
      return;
    }
    const result = await createFundingAdapter(fundingAccount, prizePool.poolAddress).submit(createShieldActions({
      token: fundingPlan.tokenAddress,
      amountMinor: fundingPlan.amountMinor,
    }));
    setFundingWalletOutcome(result);
    if (result.kind === "submitted") {
      setFundingHash(result.transactionHash);
      setNotice("The wallet submitted the reserve shield. Sign its authorization after Starknet finalizes the transaction.");
    } else if (result.kind === "user_rejected") {
      setNotice("The wallet request was declined. No funding transaction was submitted.");
    } else {
      setNotice("The wallet did not submit funding. No pool state was changed.");
    }
    setBusy("");
  }

  async function prepareSettlement() {
    if (!schedule) return;
    setBusy("pool-settlement");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool/settlement`, {
        method: "POST",
      });
      const body = await readEnvelope<PrizePool>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SETTLEMENT_PREPARE_FAILED" : body.code));
        return;
      }
      setPrizePool(body.value);
      const planResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool/settlement`);
      const planBody = await readEnvelope<FundingPlan>(planResponse);
      if (!planResponse.ok || !planBody.ok) {
        setError(friendlyError(planBody.ok ? "SETTLEMENT_PLAN_FAILED" : planBody.code));
        return;
      }
      setSettlementPlan(planBody.value);
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
      setNotice(`Winner ${body.value.winnerAgentId ?? "agent"} selected. The payout wallet is the one registered with that agent.`);
    } catch {
      setError("The winner settlement could not be prepared.");
    } finally {
      setBusy("");
    }
  }

  async function prepareWalletSettlement() {
    if (!fundingAccount || !settlementPlan || !prizePool) return;
    setBusy("settlement-prepare");
    setError("");
    setNotice("");
    const currentResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(prizePool.seasonId)}/prize-pool/settlement`);
    const currentBody = await readEnvelope<FundingPlan>(currentResponse);
    if (!currentResponse.ok || !currentBody.ok) {
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
      setError(friendlyError(currentBody.ok ? "SETTLEMENT_PLAN_FAILED" : currentBody.code));
      setBusy("");
      return;
    }
    if (!sameFundingPlan(settlementPlan, currentBody.value)) {
      setSettlementPlan(currentBody.value);
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
      setNotice("The private payout changed. Review the refreshed recipient and amount before continuing.");
      setBusy("");
      return;
    }
    const result = await createFundingAdapter(fundingAccount, prizePool.poolAddress).preparePrivateTransfer({
      token: settlementPlan.tokenAddress,
      amountMinor: settlementPlan.amountMinor,
      recipient: settlementPlan.recipient,
    });
    setSettlementWalletOutcome(result);
    setSettlementPrepared(result.kind === "prepared");
    setNotice(result.kind === "prepared" ? "The private payout passed wallet preflight. Review the wallet prompt before submitting." : "Payout preflight did not pass. No payout transaction was submitted.");
    setBusy("");
  }

  async function submitWalletSettlement() {
    if (!fundingAccount || !settlementPlan || !prizePool || !settlementPrepared) return;
    setBusy("settlement-submit");
    setError("");
    setNotice("");
    const currentResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(prizePool.seasonId)}/prize-pool/settlement`);
    const currentBody = await readEnvelope<FundingPlan>(currentResponse);
    if (!currentResponse.ok || !currentBody.ok || !sameFundingPlan(settlementPlan, currentBody.value)) {
      if (currentBody.ok) setSettlementPlan(currentBody.value);
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
      setError(friendlyError(currentBody.ok ? "SETTLEMENT_PLAN_CHANGED" : currentBody.code));
      setBusy("");
      return;
    }
    const result = await createFundingAdapter(fundingAccount, prizePool.poolAddress).submit(createPrivateTransferActions({
      token: settlementPlan.tokenAddress,
      amountMinor: settlementPlan.amountMinor,
      recipient: settlementPlan.recipient,
    }));
    setSettlementWalletOutcome(result);
    if (result.kind === "submitted") {
      setSettlementHash(result.transactionHash);
      setNotice("The private payout was submitted. Verify its Starknet receipt before publishing the settlement result.");
    } else if (result.kind === "user_rejected") {
      setNotice("The wallet request was declined. No payout transaction was submitted.");
    } else {
      setNotice("The wallet did not submit the payout. No pool state was changed.");
    }
    setBusy("");
  }

  async function confirmSettlement() {
    if (!schedule || !settlementPlan || !fundingAccount || !settlementHash.trim()) return;
    setBusy("pool-settlement-confirm");
    setError("");
    setNotice("");
    try {
      let signature: string[];
      const authorization = createArenaTransferAuthorization(settlementPlan, settlementHash.trim());
      try {
        signature = signatureStrings(
          await fundingAccount.signMessage(buildArenaTransferAuthorizationTypedData(authorization)),
        );
      } catch {
        setNotice("The payout authorization was declined or unavailable. No arena state was changed.");
        return;
      }
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool/settlement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization, signature }),
      });
      const body = await readEnvelope<PrizePool>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SETTLEMENT_CONFIRM_FAILED" : body.code));
        return;
      }
      setPrizePool(body.value);
      setSettlementHash("");
      setSettlementPlan(null);
      setSettlementPrepared(false);
      setSettlementWalletOutcome(null);
      setNotice("The private payout is verified by its sponsor authorization and finalized STRK20 pool transaction.");
    } catch {
      setError("The settlement receipt could not be checked.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="operator-page">
      <header className="operator-nav">
        <Link className="operator-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
        <div className="operator-nav-meta"><span>OPERATOR DESK</span><strong>REAL DATA ONLY</strong></div>
        <Link className="operator-nav-link" href="/sign-in">[ WALLET SIGN IN ]</Link>
      </header>

      <main className="operator-main">
        <section className="operator-intro" aria-labelledby="operator-title">
          <div className="operator-kicker"><i /> SEALED MATCH CONTROL / STARKNET</div>
          <h1 id="operator-title">Run the arena.</h1>
          <p>Create the season, choose sealed agents, lock the draw, and execute one pairing at a time. Every action below talks to the persisted Veil Arena API.</p>
        </section>

        <section className="operator-project-bar" aria-label="Project connection">
          <label htmlFor="project-id">PROJECT ID</label>
          <input id="project-id" value={projectInput} onChange={(event) => setProjectInput(event.target.value)} placeholder="Paste the persisted project ID" />
          <button type="button" className="operator-button operator-button-signal" onClick={() => void loadProject(projectInput)} disabled={busy !== ""}>{busy === "load" ? "LOADING" : "LOAD PROJECT"}<span>↗</span></button>
        </section>

        {(error || notice) ? <div className={`operator-feedback ${error ? "is-error" : "is-notice"}`} role={error ? "alert" : "status"}>{error || notice}</div> : null}

        {!projectId ? (
          <section className="operator-empty">
            <span>01 / CONNECTED PROJECT</span>
            <strong>Load a real project to begin.</strong>
            <p>The console never invents agents or project data. Use a project ID from your persisted database and sign in with a member wallet.</p>
          </section>
        ) : (
          <div className="operator-grid">
            <section className="operator-panel operator-panel-wide" aria-labelledby="season-create-title">
              <header className="operator-panel-head"><div><span>02 / SEASON CONTROL</span><h2 id="season-create-title">Make a season</h2></div><strong>{seasons.length} SAVED</strong></header>
              <form className="operator-form" onSubmit={(event) => void createSeason(event)}>
                <label>SEASON NAME<input value={seasonName} onChange={(event) => setSeasonName(event.target.value)} placeholder="Season 01" required /></label>
                <label>RULESET<input value={rulesetVersion} onChange={(event) => setRulesetVersion(event.target.value)} required /></label>
                <label>STARTS AT<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
                <label>LOCKS AT<input type="datetime-local" value={locksAt} onChange={(event) => setLocksAt(event.target.value)} required /></label>
                <label>ENDS AT<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label>
                <label>WHO CAN ENTER<select value={entryMode} onChange={(event) => setEntryMode(event.target.value as Season["entryMode"])}><option value="open">ANY SIGNED-IN WALLET</option><option value="invite_only">PROJECT MEMBERS ONLY</option></select></label>
                <label>ENTRY LIMIT<input type="number" min="2" max="32" value={maxEntries} onChange={(event) => setMaxEntries(event.target.value)} required /></label>
                <button className="operator-button operator-button-dark" type="submit" disabled={busy !== ""}>{busy === "create" ? "CREATING" : "CREATE SEASON"}<span>+</span></button>
              </form>
              <div className="operator-season-list">
                <div className="operator-subhead"><span>SEASONS IN DATABASE</span><small>{openSeasons.length} OPEN</small></div>
                {seasons.map((season) => <button type="button" key={season.id} className={`operator-season-row ${schedule?.season.id === season.id ? "is-selected" : ""}`} onClick={() => void loadSchedule(season.id)}><span>{season.status.toUpperCase()}</span><strong>{season.name}</strong><small>{season.entryCount}/{season.maxEntries} ENTRIES / {season.entryMode === "open" ? "PUBLIC" : "INVITE"}</small></button>)}
                {!seasons.length ? <p className="operator-muted">No seasons are recorded for this project.</p> : null}
              </div>
            </section>

            <section className="operator-panel" aria-labelledby="strategy-title">
              <header className="operator-panel-head"><div><span>03 / SEALED ROSTER</span><h2 id="strategy-title">Choose agents</h2></div><strong>{strategies.length} SEALED</strong></header>
              <p className="operator-panel-copy">Only public artifact metadata is shown here. Policies remain inside the server-side sealed runner.</p>
              <div className="operator-strategy-list">
                {strategies.map((strategy) => { const active = selectedAgents.includes(strategy.agentId); const alreadyInSeason = schedule?.entries.some((entry) => entry.agentId === strategy.agentId); return <label className={`operator-strategy ${active ? "is-selected" : ""} ${alreadyInSeason ? "is-registered" : ""}`} key={strategy.agentId}><input type="checkbox" checked={active} disabled={alreadyInSeason || schedule?.season.status !== "open"} onChange={() => setSelectedAgents((current) => current.includes(strategy.agentId) ? current.filter((id) => id !== strategy.agentId) : [...current, strategy.agentId])} /><span className="operator-check">{active ? "✓" : ""}</span><span><strong>{strategy.displayName}</strong><small>{strategy.agentId} / {shortCommitment(strategy.artifactCommitment)}</small></span><em>{alreadyInSeason ? "IN" : "SEALED"}</em></label>; })}
                {!strategies.length ? <p className="operator-muted">No sealed strategies are available for this project.</p> : null}
              </div>
              <button type="button" className="operator-button operator-button-signal operator-full-button" disabled={!schedule || schedule.season.status !== "open" || !selectedAgents.length || busy !== ""} onClick={() => void registerSelectedAgents()}>{busy === "register" ? "REGISTERING" : `REGISTER ${selectedAgents.length || "SELECTED"} AGENTS`}<span>↓</span></button>
            </section>

            {schedule ? <section className="operator-panel operator-panel-wide" aria-labelledby="schedule-title">
              <header className="operator-panel-head"><div><span>04 / DRAW CONTROL</span><h2 id="schedule-title">{schedule.season.name}</h2></div><strong>{schedule.season.status.toUpperCase()}</strong></header>
              <div className="operator-schedule-meta"><span>{schedule.entries.length} AGENTS</span><span>{schedule.matches.length} PAIRINGS</span><span>RULESET {schedule.season.rulesetVersion.toUpperCase()}</span><span>LOCK {readableDate(schedule.season.locksAt)}</span></div>
              {schedule.season.status === "open" ? <div className="operator-lock-bar"><label htmlFor="hands">HANDS PER PAIRING<input id="hands" type="number" min="1" max="100" value={hands} onChange={(event) => setHands(event.target.value)} /></label><p>Locking fixes the roster and creates a deterministic round-robin draw.</p><button type="button" className="operator-button operator-button-dark" onClick={() => void lockSeason()} disabled={busy !== "" || schedule.entries.length < 2}>{busy === "lock" ? "LOCKING" : "LOCK DRAW"}<span>→</span></button></div> : null}
              <div className="operator-match-list">
                {lockedMatches.map((match) => <article className="operator-match-row" key={match.id}><span className="operator-sequence">{String(match.sequence).padStart(2, "0")}</span><div><strong>{match.leftAgentId.toUpperCase()} <b>VS</b> {match.rightAgentId.toUpperCase()}</strong><small>{match.hands} HANDS / {match.status.toUpperCase()}{match.matchId ? ` / ${shortCommitment(match.matchId)}` : ""}</small></div><button type="button" className="operator-run-button" onClick={() => void runMatch(match)} disabled={match.status === "completed" || match.status === "running" || busy !== ""}>{busy === `run-${match.id}` ? "RUNNING" : match.status === "completed" ? "DONE" : "RUN"}</button></article>)}
                {!lockedMatches.length ? <p className="operator-muted">Lock the season to create real pairings.</p> : null}
              </div>
            </section> : null}

            {latestMatch ? <section className="operator-result" aria-labelledby="result-title"><header><span>05 / LAST EXECUTION</span><strong>PUBLIC RECEIPT READY</strong></header><div><h2 id="result-title">{latestMatch.players.map((player) => player.displayName.toUpperCase()).join(" / ")}</h2><p><b>{latestMatch.players.map((player) => latestMatch.score[player.agentId] ?? 0).join(" : ")}</b> score / {latestMatch.signedReceipt ? "signed receipt" : "receipt committed"}</p><code>TRANSCRIPT {shortCommitment(latestMatch.transcriptRoot)}</code></div><Link className="operator-button operator-button-dark" href={`/?project=${encodeURIComponent(projectId)}`}>OPEN PUBLIC ARENA <span>↗</span></Link></section> : null}

            {schedule && (schedule.season.status === "open" || schedule.season.status === "locked") ? <section className="operator-panel operator-panel-wide" aria-labelledby="pool-title">
              <header className="operator-panel-head"><div><span>06 / STRK20 SETTLEMENT</span><h2 id="pool-title">Sponsor the winner</h2></div><strong>{prizePool?.status.replaceAll("_", " ").toUpperCase() ?? "NOT CREATED"}</strong></header>
              <p className="operator-panel-copy">The sponsor shields the listed reserve into their own STRK20 balance, then pays the winner privately. Veil Arena verifies the wallet authorization and chain receipt, but never signs, broadcasts, or holds the sponsor&apos;s funds.</p>
              {!prizePool ? <form className="operator-form operator-pool-form" onSubmit={(event) => void createPrizePool(event)}><label>TOKEN CONTRACT<input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="0x..." required /></label><label>TOKEN SYMBOL<input value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value)} placeholder="USDC" required /></label><label>PRIZE AMOUNT IN MINOR UNITS<input value={prizeAmount} onChange={(event) => setPrizeAmount(event.target.value)} inputMode="numeric" placeholder="1000000" required /></label><button className="operator-button operator-button-signal" type="submit" disabled={busy !== ""}>{busy === "pool-create" ? "CREATING" : "CREATE SPONSOR POOL"}<span>+</span></button></form> : null}
              {prizePool && (prizePool.status === "funding_pending" || prizePool.status === "unknown") ? (
                <div className="operator-chain-step">
                  <div>
                    <span>SPONSOR RESERVE</span>
                    <strong>Shield the reward, then sign its authorization</strong>
                    <small>{prizePool.amountMinor} {prizePool.tokenSymbol} minor units / STRK20 pool {shortCommitment(prizePool.poolAddress)}</small>
                  </div>
                  <div className="operator-chain-actions">
                    <button type="button" className="operator-button operator-button-signal" onClick={() => void prepareFundingPlan()} disabled={busy !== ""}>{busy === "pool-plan" ? "PREPARING" : "SHOW SHIELD"}<span>→</span></button>
                    {fundingPlan && !fundingAccount ? <WalletPicker wallets={wallets} disabled={busy !== ""} onSelect={(wallet) => void connectFundingWallet(wallet)} /> : null}
                    {fundingPlan && fundingAccount ? <><span className="operator-wallet-connected">{fundingWalletName.toUpperCase()} READY</span><button type="button" className="operator-button operator-button-signal" onClick={() => void prepareWalletFunding()} disabled={busy !== "" || fundingPrepared}>{busy === "funding-prepare" ? "CHECKING" : fundingPrepared ? "PREPARED" : "CHECK WALLET"}<span>→</span></button><button type="button" className="operator-button operator-button-dark" onClick={() => void submitWalletFunding()} disabled={busy !== "" || !fundingPrepared}>{busy === "funding-submit" ? "WAITING" : "REQUEST WALLET"}<span>↗</span></button></> : null}
                    <label className="operator-inline-field">TRANSACTION HASH<input value={fundingHash} onChange={(event) => setFundingHash(event.target.value)} placeholder="0x..." /></label>
                    <button type="button" className="operator-button operator-button-dark" onClick={() => void confirmFunding()} disabled={busy !== "" || !fundingPlan || !fundingAccount || !fundingHash.trim()}>{busy === "pool-funding" ? "SIGNING" : "SIGN AND VERIFY"}<span>↗</span></button>
                  </div>
                  {fundingPlan ? <div className="operator-plan" aria-label="Prepared sponsor shield"><span>{fundingPlan.network} / PRIVATE BALANCE SHIELD</span><code>{fundingPlan.amountMinor} {fundingPlan.tokenSymbol} / {shortCommitment(fundingPlan.tokenAddress)} → PRIVATE BALANCE {shortCommitment(fundingPlan.recipient)}</code><small>{fundingAccount ? "The sponsor wallet can review, submit, and authorize this exact plan." : "Connect the sponsor wallet to enable wallet preflight and submission."}</small></div> : null}
                  <small className="operator-wallet-note">The chain confirms finality and a direct STRK20 pool call. The sponsor signature binds the listed plan. Veil Arena does not custody or lock the sponsor balance.</small>
                  {fundingWalletOutcome?.kind === "error" ? <small className="operator-wallet-note">Wallet preflight or submission failed. No arena state was changed.</small> : null}
                </div>
              ) : null}
              {prizePool?.status === "funded" && schedule.season.status === "open" ? <div className="operator-chain-step"><div><span>SPONSOR RESERVE VERIFIED</span><strong>Players can enter against an authorized reward plan</strong><small>The reserve is in the sponsor&apos;s private balance. Lock the roster and finish every pairing before payout.</small></div></div> : null}
              {prizePool?.status === "funded" && schedule.season.status === "locked" ? <div className="operator-chain-step"><div><span>SPONSOR RESERVE VERIFIED</span><strong>All pairings must be complete before selection</strong><small>The winner receives the private payout at the wallet bound when that agent entered.</small></div><button type="button" className="operator-button operator-button-dark" onClick={() => void prepareSettlement()} disabled={busy !== ""}>{busy === "pool-settlement" ? "SELECTING" : "SELECT WINNER"}<span>→</span></button></div> : null}
              {prizePool?.status === "settlement_pending" ? <div className="operator-chain-step"><div><span>WINNER SELECTED / {prizePool.winnerAgentId?.toUpperCase()}</span><strong>Submit the private payout, then authorize it</strong><small>Recipient sealed as {shortCommitment(prizePool.recipientFingerprint ?? "")}</small></div><div className="operator-chain-actions">{settlementPlan && !fundingAccount ? <WalletPicker wallets={wallets} disabled={busy !== ""} onSelect={(wallet) => void connectFundingWallet(wallet)} /> : null}{settlementPlan && fundingAccount ? <><span className="operator-wallet-connected">{fundingWalletName.toUpperCase()} READY</span><button type="button" className="operator-button operator-button-signal" onClick={() => void prepareWalletSettlement()} disabled={busy !== "" || settlementPrepared}>{busy === "settlement-prepare" ? "CHECKING" : settlementPrepared ? "PREPARED" : "CHECK WALLET"}<span>→</span></button><button type="button" className="operator-button operator-button-dark" onClick={() => void submitWalletSettlement()} disabled={busy !== "" || !settlementPrepared}>{busy === "settlement-submit" ? "WAITING" : "REQUEST WALLET"}<span>↗</span></button></> : null}<label className="operator-inline-field">SETTLEMENT TRANSACTION HASH<input value={settlementHash} onChange={(event) => setSettlementHash(event.target.value)} placeholder="0x..." /></label><button type="button" className="operator-button operator-button-dark" onClick={() => void confirmSettlement()} disabled={busy !== "" || !settlementPlan || !fundingAccount || !settlementHash.trim()}>{busy === "pool-settlement-confirm" ? "SIGNING" : "SIGN AND VERIFY"}<span>↗</span></button></div>{settlementPlan ? <div className="operator-plan" aria-label="Prepared private payout"><span>{settlementPlan.network} / PRIVATE PAYOUT</span><code>{settlementPlan.amountMinor} {settlementPlan.tokenSymbol} / {shortCommitment(settlementPlan.tokenAddress)} → {shortCommitment(settlementPlan.recipient)}</code><small>{fundingAccount ? "The sponsor wallet can review, submit, and authorize this exact payout." : "Connect the sponsor wallet to enable wallet preflight and submission."}</small></div> : null}<small className="operator-wallet-note">The chain confirms finality and a direct STRK20 pool call. The sponsor signature binds the hidden payout plan without publishing its recipient.</small>{settlementWalletOutcome?.kind === "error" ? <small className="operator-wallet-note">Wallet preflight or submission failed. No arena state was changed.</small> : null}</div> : null}
              {prizePool?.status === "settled" ? <div className="operator-chain-complete"><span>SETTLEMENT COMPLETE</span><strong>{prizePool.winnerAgentId?.toUpperCase()} / PRIVATE REWARD VERIFIED</strong><small>The chain receipts and sponsor authorizations are confirmed. Hidden payout details and recipient identity remain private.</small></div> : null}
            </section> : null}
          </div>
        )}
      </main>

      <footer className="operator-footer"><VeilLogo /><span>VEIL ARENA / OPERATOR SURFACE</span><span>WALLET SIGNS / SERVER NEVER BROADCASTS</span></footer>
    </div>
  );
}

function createFundingAdapter(account: FundingAccount, poolAddress: string) {
  return new Strk20WalletAdapter({
    account,
    poolAddress,
    readPoolFee: readLivePoolFee,
    receiptProvider: createClientReceiptProvider(),
  });
}

function sameFundingPlan(left: FundingPlan, right: FundingPlan): boolean {
  return left.network === right.network
    && left.operation === right.operation
    && left.projectId === right.projectId
    && left.seasonId === right.seasonId
    && left.poolId === right.poolId
    && left.poolAddress === right.poolAddress
    && left.tokenAddress === right.tokenAddress
    && left.tokenSymbol === right.tokenSymbol
    && left.amountMinor === right.amountMinor
    && left.recipient === right.recipient
    && left.planDigest === right.planDigest;
}
