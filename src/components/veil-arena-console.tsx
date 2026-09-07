"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import type { TypedData } from "starknet";

import { VeilLogo } from "@/components/veil-logo";
import { ArenaThemeToggle } from "@/components/arena/arena-theme-toggle";
import { ArenaNotificationBell, recordArenaNotification } from "@/components/arena/arena-notification-bell";
import {
  buildArenaTransferAuthorizationTypedData,
  createArenaTransferAuthorization,
  type ArenaTransferPlan,
} from "@/domain/arena/transfer-authorization";
import {
  TOURNAMENT_TEMPLATES,
  resolveTournamentRules,
  type TournamentPairingMode,
  type TournamentRewardDistribution,
  type TournamentResubmissionPolicy,
  type TournamentRules,
  type TournamentTemplateId,
  type TournamentWorkload,
  usesStrk20RewardRail,
} from "@/domain/arena/tournament-rules";
import { ARENA_PRIZE_TOKENS, type ArenaPrizeTokenId } from "@/domain/arena/prize-tokens";
import { formatTokenAmountFromMinor, parseTokenAmountToMinor } from "@/domain/arena/token-amount";
import { apiFetch } from "@/lib/api/client";
import {
  createPrivateTransferActions,
  createShieldActions,
  Strk20WalletAdapter,
  type Strk20WalletAccount,
} from "@/lib/strk20/adapter";
import type { Strk20Outcome } from "@/lib/strk20/types";
import { type ConnectedSessionWallet, type WalletStandardWallet } from "@/lib/wallet/account";
import { createClientReceiptProvider, readLivePoolFee } from "@/components/wallet/strk20-desk-utils";
import { WalletPicker } from "@/components/wallet/wallet-picker";
import { WalletSessionButton } from "@/components/wallet/wallet-session-button";

type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; code: string };

const quickStartTemplates = TOURNAMENT_TEMPLATES.filter((template) => template.group === "quick_start" && template.id !== "sponsored_open");
const advancedTemplates = TOURNAMENT_TEMPLATES.filter((template) => template.group === "advanced");

type Project = {
  id: string;
  name: string;
  createdAt: string;
  roles: string[];
};

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
  entryLimit: "capped" | "unlimited";
  templateId?: TournamentTemplateId;
  templateVersion?: number;
  rules?: TournamentRules;
  rulesCommitment?: string;
  workload?: TournamentWorkload;
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
  roundNumber?: number;
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
  AUTH_REQUIRED: "Sign in with an operator wallet to use this desk.",
  PROJECT_ACCESS_REQUIRED: "This wallet does not have access to the project.",
  ROLE_FORBIDDEN: "Only a project operator or reviewer can take this action.",
  PROJECT_NOT_FOUND: "That project was not found in the connected database.",
  ARENA_SEASON_NOT_FOUND: "That season no longer exists.",
  ARENA_SEASON_TOO_SMALL: "At least two agents must enter before you can lock the draw.",
  ARENA_BENCHMARK_REQUIRED: "Choose one enrolled agent as the sealed benchmark before locking this gauntlet.",
  ARENA_SEASON_ALREADY_LOCKED: "This season is already locked.",
  ARENA_SEASON_NOT_LOCKED: "Lock the season before running a scheduled pairing.",
  ARENA_SEASON_NOT_ACTIVE: "You can add a prize only while the competition is open or locked.",
  ARENA_SEASON_FULL: "This season has reached its entry limit.",
  ARENA_DUPLICATE_STRATEGY: "This competition already has an entry with the same strategy. Change its policy or choose another competition. Your saved agent is unchanged.",
  ARENA_WALLET_ALREADY_ENTERED: "This wallet already has an agent in the season.",
  ARENA_PRIZE_POOL_NOT_FOUND: "This competition does not have a prize yet.",
  ARENA_PRIZE_POOL_ALREADY_EXISTS: "This season already has a prize pool.",
  ARENA_PRIZE_POOL_ALREADY_FUNDED: "Sponsor funding is already recorded for this pool.",
  ARENA_PRIZE_POOL_NOT_FUNDED: "This format requires a funded reward before the roster can be locked.",
  ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY: "Prepare the winner settlement before confirming its transaction.",
  ARENA_PRIZE_POOL_ALREADY_SETTLED: "This prize pool has already been settled.",
  ARENA_MATCH_NOT_COMPLETE: "Finish every pairing before selecting the winner.",
  ARENA_WINNER_TIE: "A paid rank is tied. The payout waits for an unambiguous result.",
  ARENA_WINNER_PAYOUT_NOT_REGISTERED: "The winning agent has no verified payout wallet. Do not prepare a manual replacement.",
  ARENA_PAYOUT_NOT_ENOUGH_WINNERS: "This payout preset needs more ranked agents than entered the season. Choose a smaller top-N payout or wait for more entries.",
  ARENA_PAYOUT_AMOUNT_TOO_SMALL: "The reward is too small to split across every selected rank. Choose fewer winners or a larger reward.",
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

function rewardDistributionCopy(value: TournamentRewardDistribution): string {
  if (value === "winner_takes_all") return "Winner takes all";
  return `Top ${value.replace("top_", "")} share the pool by rank`;
}

function toIso(value: string): string | undefined {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function defaultCompetitionWindow(): { startsAt: string; locksAt: string; endsAt: string } {
  const now = Date.now();
  return {
    startsAt: new Date(now).toISOString(),
    locksAt: new Date(now + 70 * 60_000).toISOString(),
    endsAt: new Date(now + 24 * 60 * 60_000).toISOString(),
  };
}

function friendlyError(code: string): string {
  return errorCopy[code] ?? `The arena server returned ${code}.`;
}

function walletOutcomeCopy(outcome: Strk20Outcome | null): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case "unsupported": return `This wallet needs STRK20 Wallet API ${outcome.minimum} or newer.`;
    case "insufficient_private_balance": return "The wallet has no private balance for this exact reward. Fund the wallet privately, then retry.";
    case "recipient_not_ready": return "The STRK20 pool is not ready yet. Retry after the pool configuration is available.";
    case "user_rejected": return "The wallet request was declined. Nothing was submitted.";
    case "error": return `Wallet ${outcome.code === "PREPARATION_FAILED" ? "preflight" : "submission"} failed. Nothing was submitted.`;
    case "reverted": return `The wallet transaction reverted: ${outcome.reason}`;
    case "expired": return `The wallet authorization expired: ${outcome.reason}`;
    case "unknown": return outcome.reason ? `The wallet returned an unknown result: ${outcome.reason}` : "The wallet result is not confirmed yet. Check the wallet before retrying.";
    default: return null;
  }
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

export function VeilArenaConsole({ managedProjectId, managedSeasonId }: { managedProjectId?: string; managedSeasonId?: string } = {}) {
  const manageMode = Boolean(managedProjectId && managedSeasonId);
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
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
  const [templateId, setTemplateId] = useState<TournamentTemplateId>("playground");
  const [locksAt, setLocksAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [entryMode, setEntryMode] = useState<Season["entryMode"]>("open");
  const [maxEntries, setMaxEntries] = useState("8");
  const [customPairingMode, setCustomPairingMode] = useState<TournamentPairingMode>("round_robin");
  const [customHands, setCustomHands] = useState("20");
  const customEncounters = "1";
  const [qualificationHands, setQualificationHands] = useState("20000");
  const [customResubmission, setCustomResubmission] = useState<TournamentResubmissionPolicy>("replace_until_lock");
  const [benchmarkAgentId, setBenchmarkAgentId] = useState("");
  const [fundingEnabled, setFundingEnabled] = useState(false);
  const [rewardDistribution, setRewardDistribution] = useState<TournamentRewardDistribution>("winner_takes_all");
  const [prizeTokenId, setPrizeTokenId] = useState<ArenaPrizeTokenId>("USDC");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [fundingHash, setFundingHash] = useState("");
  const [settlementHash, setSettlementHash] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [privateInvitation, setPrivateInvitation] = useState("");
  const [privateInvitationQr, setPrivateInvitationQr] = useState<{ invitation: string; dataUrl: string } | null>(null);
  const selectedPrizeToken = ARENA_PRIZE_TOKENS[prizeTokenId];

  const handleWalletAuthenticated = useCallback(({ wallet, account }: { wallet: WalletStandardWallet; account: ConnectedSessionWallet }) => {
    setFundingAccount(account);
    setFundingWalletName(wallet.name);
    setFundingPrepared(false);
    setFundingWalletOutcome(null);
    setNotice(`${wallet.name} is connected. You can now publish or fund a competition.`);
  }, []);

  const handleWalletDisconnected = useCallback(() => {
    setFundingAccount(null);
    setFundingWalletName("");
    setFundingPlan(null);
    setFundingPrepared(false);
    setFundingWalletOutcome(null);
  }, []);

  const openSeasons = useMemo(() => seasons.filter((season) => season.status === "open"), [seasons]);
  const lockedMatches = schedule?.matches ?? [];
  const draftRules = useMemo(() => {
    try {
      return resolveTournamentRules({
        templateId,
        qualificationHands: Number(qualificationHands),
        rewardDistribution,
        custom: templateId === "custom" ? {
          pairingMode: customPairingMode,
          entryMode,
          entryLimit: customPairingMode === "sampled_rounds" ? "unlimited" : "capped",
          maxEntries: Number(maxEntries),
          handsPerMatch: Number(customHands),
          encountersPerPair: Number(customEncounters),
          resubmissionPolicy: customResubmission,
          rewardPolicy: fundingEnabled ? "funded_before_start" : "optional",
          rewardDistribution,
          qualificationHands: Number(qualificationHands),
        } : undefined,
      });
    } catch {
      return null;
    }
  }, [customHands, customPairingMode, customResubmission, entryMode, fundingEnabled, maxEntries, qualificationHands, rewardDistribution, templateId]);
  const draftRequiresFunding = fundingEnabled || draftRules?.rewardPolicy === "funded_before_start";

  useEffect(() => () => fundingAccount?.unsubscribeChange?.(), [fundingAccount]);

  useEffect(() => {
    let cancelled = false;
    if (!privateInvitation) return;
    void QRCode.toDataURL(privateInvitation, {
      width: 192,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#211f2a", light: "#f7f1e6" },
    }).then((dataUrl) => {
      if (!cancelled) setPrivateInvitationQr({ invitation: privateInvitation, dataUrl });
    }).catch(() => {
      if (!cancelled) setPrivateInvitationQr(null);
    });
    return () => { cancelled = true; };
  }, [privateInvitation]);

  const loadProject = useCallback(async (nextProjectId: string) => {
    const normalized = nextProjectId.trim();
    if (!normalized) {
      setError("Enter a project ID to open the operator desk.");
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
      setSeasons(seasonBody.value);
      setStrategies(strategyBody.value);
      setNotice(`Loaded ${seasonBody.value.length} competition${seasonBody.value.length === 1 ? "" : "s"} and ${strategyBody.value.length} sealed agent${strategyBody.value.length === 1 ? "" : "s"}.`);
    } catch {
      setError("The arena server could not be reached.");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    const linkedProjectId = managedProjectId?.trim() || new URLSearchParams(window.location.search).get("project")?.trim();
    if (!linkedProjectId) return;
    const timer = window.setTimeout(() => void loadProject(linkedProjectId), 0);
    return () => window.clearTimeout(timer);
  }, [loadProject, managedProjectId]);

  useEffect(() => {
    if (!manageMode || !managedSeasonId || projectId !== managedProjectId) return;
    const timer = window.setTimeout(() => void loadSchedule(managedSeasonId), 0);
    return () => window.clearTimeout(timer);
    // loadSchedule is a local command that reads the current mutable project state.
    // It is intentionally invoked only after the managed route has resolved its project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageMode, managedProjectId, managedSeasonId, projectId]);

  async function loadSchedule(seasonId: string) {
    setBusy("schedule");
    setError("");
    setNotice("");
    setPrivateInvitation("");
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
    const defaults = defaultCompetitionWindow();
    const starts = defaults.startsAt;
    const locks = toIso(locksAt) ?? defaults.locksAt;
    const ends = toIso(endsAt) ?? defaults.endsAt;
    if (!seasonName.trim() || !starts || !locks || !ends || !(starts < locks && locks < ends) || !draftRules) {
      setError("Add a name, choose valid tournament rules, and set the roster lock before the competition end.");
      return;
    }
    const amountMinor = draftRequiresFunding ? parseTokenAmountToMinor(prizeAmount, selectedPrizeToken.decimals) : null;
    if (draftRequiresFunding && !amountMinor) {
      setError("Choose the reward token and enter the amount before publishing. There is no default reward.");
      return;
    }
    setBusy("create");
    setError("");
    setNotice("");
    try {
      let targetProjectId = projectId;
      if (!targetProjectId) {
        const projectResponse = await apiFetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${seasonName.trim()} arena` }),
        });
        const projectBody = await readEnvelope<Project>(projectResponse);
        if (!projectResponse.ok || !projectBody.ok) {
          setError(friendlyError(projectBody.ok ? "PROJECT_CREATE_FAILED" : projectBody.code));
          return;
        }
        targetProjectId = projectBody.value.id;
      }
      const response = await apiFetch(`/api/projects/${encodeURIComponent(targetProjectId)}/seasons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("season") },
        body: JSON.stringify({
          name: seasonName.trim(),
          startsAt: starts,
          locksAt: locks,
          endsAt: ends,
          templateId,
          qualificationHands: Number(qualificationHands),
          customRules: templateId === "custom" ? {
            pairingMode: customPairingMode,
            entryMode,
            entryLimit: customPairingMode === "sampled_rounds" ? "unlimited" : "capped",
            maxEntries: Number(maxEntries),
            handsPerMatch: Number(customHands),
            encountersPerPair: Number(customEncounters),
            resubmissionPolicy: customResubmission,
            rewardPolicy: fundingEnabled ? "funded_before_start" : "optional",
            rewardDistribution,
            qualificationHands: Number(qualificationHands),
          } : undefined,
        }),
      });
      const body = await readEnvelope<Season>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SEASON_CREATE_FAILED" : body.code));
        return;
      }
      setProjectId(targetProjectId);
      setSeasons((current) => [body.value, ...current.filter((season) => season.id !== body.value.id)]);
      setSchedule({ season: body.value, entries: [], matches: [] });
      if (draftRequiresFunding && amountMinor) {
        const rewardResponse = await apiFetch(`/api/projects/${encodeURIComponent(targetProjectId)}/seasons/${encodeURIComponent(body.value.id)}/prize-pool`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("pool") },
          body: JSON.stringify({ tokenAddress: selectedPrizeToken.address, tokenSymbol: selectedPrizeToken.symbol, amountMinor }),
        });
        const rewardBody = await readEnvelope<PrizePool>(rewardResponse);
        if (!rewardResponse.ok || !rewardBody.ok) {
          setError(friendlyError(rewardBody.ok ? "PRIZE_POOL_CREATE_FAILED" : rewardBody.code));
          return;
        }
        setPrizePool(rewardBody.value);
      }
      recordArenaNotification({
        title: draftRequiresFunding ? "Competition prepared" : "Competition published",
        body: draftRequiresFunding ? "Fund the exact reward on the competition page to make it ready for entries." : body.value.entryMode === "invite_only" ? "Fund the reward to unlock the private join link." : "Your competition is open for agent entries.",
        href: `/arena-console/${encodeURIComponent(targetProjectId)}/${encodeURIComponent(body.value.id)}`,
      });
      router.push(`/arena-console/${encodeURIComponent(targetProjectId)}/${encodeURIComponent(body.value.id)}`);
    } catch {
      setError("The season could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function createPrivateInvitation() {
    if (!schedule || schedule.season.entryMode !== "invite_only" || prizePool?.status !== "funded") return;
    setBusy("invitation");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/invitation`, {
        method: "POST",
      });
      const body = await readEnvelope<{ url: string; expiresAt: string }>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "INVITATION_FAILED" : body.code));
        return;
      }
      setPrivateInvitation(body.value.url);
      recordArenaNotification({
        title: "Private join link ready",
        body: "Share the link with your challenger, then use the JOIN PRIVATE RING action to enter with your own agent.",
        href: `/arena-console/${encodeURIComponent(projectId)}/${encodeURIComponent(schedule.season.id)}`,
      });
      try {
        await navigator.clipboard.writeText(body.value.url);
        setNotice(`Private join link copied. It expires ${readableDate(body.value.expiresAt)}.`);
      } catch {
        setNotice(`Private join link created. Copy it from the field below before ${readableDate(body.value.expiresAt)}.`);
      }
    } catch {
      setError("The private join link could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function copyExistingInvitation() {
    if (!privateInvitation) return;
    try {
      await navigator.clipboard.writeText(privateInvitation);
      setNotice("Private join link copied. Share it with your challenger.");
    } catch {
      setNotice("Select the private join link, then copy it to share with your challenger.");
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
      setNotice(`Added ${selectedAgents.length} sealed agent${selectedAgents.length === 1 ? "" : "s"} to the competition.`);
      recordArenaNotification({ title: "Roster updated", body: `${selectedAgents.length} sealed agent${selectedAgents.length === 1 ? " is" : "s are"} ready for the draw.`, href: `/arena-console/${encodeURIComponent(projectId)}/${encodeURIComponent(schedule.season.id)}` });
      await loadSchedule(schedule.season.id);
    } catch {
      setError("The selected agents could not be registered.");
    } finally {
      setBusy("");
    }
  }

  async function lockSeason() {
    if (!schedule) return;
    const needsBenchmark = schedule.season.rules?.pairingMode === "gauntlet";
    if (needsBenchmark && !benchmarkAgentId) {
      setError("Choose one enrolled agent as the benchmark before locking the gauntlet.");
      return;
    }
    setBusy("lock");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("lock") },
        body: JSON.stringify(needsBenchmark ? { benchmarkAgentId } : {}),
      });
      const body = await readEnvelope<Schedule>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "SEASON_LOCK_FAILED" : body.code));
        return;
      }
      setSchedule(body.value);
      setSeasons((current) => current.map((season) => season.id === body.value.season.id ? body.value.season : season));
      setNotice(`The draw is locked with ${body.value.matches.length} pairing${body.value.matches.length === 1 ? "" : "s"}.`);
      recordArenaNotification({ title: "Draw locked", body: `${body.value.matches.length} pairing${body.value.matches.length === 1 ? " is" : "s are"} ready to run.`, href: `/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(body.value.season.id)}` });
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
      setNotice(`${body.value.matchId} finished. Its public receipt is ready.`);
      recordArenaNotification({ title: "Verified replay ready", body: "A completed match receipt is ready to watch.", href: `/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(schedule.season.id)}/match/${encodeURIComponent(match.id)}` });
      await loadSchedule(schedule.season.id);
    } catch {
      setError("The scheduled pairing could not be reached.");
    } finally {
      setBusy("");
    }
  }

  async function createPrizePool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schedule || !fundingAccount) {
      setNotice("Connect your wallet above before funding this competition.");
      return;
    }
    const amountMinor = parseTokenAmountToMinor(prizeAmount, selectedPrizeToken.decimals);
    if (!amountMinor) {
      setError("Enter a positive token amount with no more decimal places than the token supports. USDC uses 6 decimals.");
      return;
    }
    setBusy("pool-create");
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(schedule.season.id)}/prize-pool`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": freshKey("pool") },
        body: JSON.stringify({ tokenAddress: selectedPrizeToken.address, tokenSymbol: selectedPrizeToken.symbol, amountMinor }),
      });
      const body = await readEnvelope<PrizePool>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "PRIZE_POOL_CREATE_FAILED" : body.code));
        return;
      }
      setPrizePool(body.value);
      await fundPool(body.value);
    } catch {
      setError("The sponsor pool could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function fundPool(pool: PrizePool) {
    if (!schedule || !fundingAccount) return;
    setBusy("funding");
    setError("");
    setNotice("Preparing the exact reward in your connected wallet...");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(pool.seasonId)}/prize-pool/funding`);
      const body = await readEnvelope<FundingPlan>(response);
      if (!response.ok || !body.ok) {
        setError(friendlyError(body.ok ? "FUNDING_PLAN_FAILED" : body.code));
        return;
      }
      const plan = body.value;
      setFundingPlan(plan);
      setFundingPrepared(false);
      const adapter = createFundingAdapter(fundingAccount, pool.poolAddress);
      const prepared = await adapter.prepareShield({ token: plan.tokenAddress, amountMinor: plan.amountMinor });
      setFundingWalletOutcome(prepared);
      if (prepared.kind !== "prepared") {
        setError(walletOutcomeCopy(prepared) ?? "The wallet could not prepare funding. Nothing was submitted.");
        return;
      }
      setFundingPrepared(true);
      setNotice("Approve the reward in your wallet. Veil Arena will verify the receipt automatically.");
      const submitted = await adapter.submit(createShieldActions({ token: plan.tokenAddress, amountMinor: plan.amountMinor }));
      setFundingWalletOutcome(submitted);
      if (submitted.kind !== "submitted") {
        setError(walletOutcomeCopy(submitted) ?? "The wallet did not submit funding. No pool state was changed.");
        return;
      }
      setFundingHash(submitted.transactionHash);
      await confirmFundingWith(plan, submitted.transactionHash, fundingAccount);
    } catch {
      setError("The wallet could not prepare funding. Nothing was submitted.");
    } finally {
      setBusy("");
    }
  }

  async function confirmFunding() {
    if (!fundingPlan || !fundingAccount || !fundingHash.trim()) return;
    await confirmFundingWith(fundingPlan, fundingHash.trim(), fundingAccount);
  }

  async function confirmFundingWith(plan: FundingPlan, transactionHash: string, account: FundingAccount) {
    if (!schedule) return;
    setBusy("pool-funding");
    setError("");
    setNotice("");
    try {
      let signature: string[];
      const authorization = createArenaTransferAuthorization(plan, transactionHash);
      try {
        signature = signatureStrings(
          await account.signMessage(buildArenaTransferAuthorizationTypedData(authorization)),
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
      setNotice("Reward funded. Create the join link below to share the competition.");
    } catch {
      setError("The funding receipt could not be checked.");
    } finally {
      setBusy("");
    }
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
      setNotice(`${body.value.winnerAgentId ?? "The winning agent"} won. Its registered payout wallet will receive the reward.`);
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
      transfers: settlementPlan.recipients?.map((recipient) => ({ amountMinor: recipient.amountMinor, recipient: recipient.recipient })),
    });
    setSettlementWalletOutcome(result);
    setSettlementPrepared(result.kind === "prepared");
    setNotice(result.kind === "prepared" ? "The wallet accepted the payout details. Review them once more before submitting." : "The wallet could not prepare the payout. Nothing was submitted.");
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
      transfers: settlementPlan.recipients?.map((recipient) => ({ amountMinor: recipient.amountMinor, recipient: recipient.recipient })),
    }));
    setSettlementWalletOutcome(result);
    if (result.kind === "submitted") {
      setSettlementHash(result.transactionHash);
      setNotice("The private payout was submitted. Verify the Starknet receipt before publishing the result.");
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
      setNotice("The private payout is verified. The sponsor authorization and final STRK20 transaction both match.");
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
        <Link className="operator-back" href={manageMode && managedProjectId && managedSeasonId ? `/arena/${encodeURIComponent(managedProjectId)}/${encodeURIComponent(managedSeasonId)}` : "/"}>← {manageMode ? "Public room" : "Home"}</Link>
        <div className="operator-nav-meta"><span>OPERATOR DESK</span><strong>LIVE COMPETITION CONTROL</strong></div>
        <div className="operator-nav-actions">
          <ArenaThemeToggle />
          <ArenaNotificationBell />
          <span className="operator-nav-wallet"><WalletSessionButton returnTo="/arena-console" onAuthenticated={handleWalletAuthenticated} onDisconnected={handleWalletDisconnected} /></span>
        </div>
      </header>

      <main className="operator-main">
        <section className="operator-intro" aria-labelledby="operator-title">
          <div className="operator-kicker"><i /> COMPETITION CONTROL / STARKNET</div>
          <h1 id="operator-title">{manageMode ? "Run a competition." : "Host a competition."}</h1>
          <p>{manageMode ? "Run the draw, keep strategies sealed, and verify any private reward from the same desk." : "Choose the format, lock time, and reward. One publish action creates the competition."}</p>
          {manageMode && managedProjectId && managedSeasonId ? <div className="operator-live-links"><Link href={`/arena/${encodeURIComponent(managedProjectId)}/${encodeURIComponent(managedSeasonId)}`}>Watch public competition →</Link><Link href="/arena">Browse all competitions</Link></div> : null}
        </section>

        {(error || notice) ? <div className={`operator-feedback ${error ? "is-error" : "is-notice"}`} role={error ? "alert" : "status"}>{error || notice}</div> : null}

        <div className="operator-grid" id="operator-controls">
            {!manageMode ? <section className="operator-panel operator-panel-wide" aria-labelledby="season-create-title">
              <header className="operator-panel-head"><div><span>01 / FORMAT AND ENTRY</span><h2 id="season-create-title">Create a competition</h2></div><strong>{seasons.length} SAVED</strong></header>
              <form className="operator-form operator-simple-create" onSubmit={(event) => void createSeason(event)}>
                <fieldset className="operator-template-fieldset">
                  <legend>WHAT ARE YOU HOSTING?</legend>
                  <div className="operator-template-grid">
                    {quickStartTemplates.map((template) => (
                      <button
                        type="button"
                        key={template.id}
                        className={`operator-template-card ${templateId === template.id ? "is-selected" : ""}`}
                        aria-pressed={templateId === template.id}
                        onClick={() => {
                          setTemplateId(template.id);
                          setFundingEnabled(template.id === "sponsored_open");
                          if (template.rules?.qualificationHands) setQualificationHands(String(template.rules.qualificationHands));
                        }}
                      >
                        <span>{template.name}</span>
                        <strong>{template.summary}</strong>
                        <small>{template.bestFor}</small>
                      </button>
                    ))}
                  </div>
                  <details className="operator-advanced-formats">
                    <summary>Advanced formats</summary>
                    <div className="operator-template-grid">
                      {advancedTemplates.map((template) => (
                        <button
                          type="button"
                          key={template.id}
                          className={`operator-template-card ${templateId === template.id ? "is-selected" : ""}`}
                          aria-pressed={templateId === template.id}
                          onClick={() => {
                            setTemplateId(template.id);
                            setFundingEnabled(template.id === "sponsored_open");
                            if (template.rules?.qualificationHands) setQualificationHands(String(template.rules.qualificationHands));
                          }}
                        >
                          <span>{template.name}</span>
                          <strong>{template.summary}</strong>
                          <small>{template.bestFor}</small>
                        </button>
                      ))}
                    </div>
                  </details>
                </fieldset>
                <label className="operator-funding-toggle">
                  <input type="checkbox" checked={fundingEnabled} onChange={(event) => setFundingEnabled(event.target.checked)} />
                  <span className="operator-toggle-box" aria-hidden="true">{fundingEnabled ? "✓" : ""}</span>
                  <span><strong>Fund this competition</strong><small>Optional. Turn on to choose STRK or USDC and enter the reward amount.</small></span>
                </label>
                <label>SEASON NAME<input value={seasonName} onChange={(event) => setSeasonName(event.target.value)} placeholder="Season 01" required /></label>
                <label>LOCKS AT<input type="datetime-local" value={locksAt} onChange={(event) => setLocksAt(event.target.value)} /></label>
                <label>ENDS AT<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
                <label>QUALIFICATION SAMPLE<select value={qualificationHands} onChange={(event) => setQualificationHands(event.target.value)}><option value="100">100 DECISIONS / QUICK TEST</option><option value="500">500 DECISIONS / EXHIBITION</option><option value="1000">1,000 DECISIONS / CHALLENGE</option><option value="5000">5,000 DECISIONS / LEAGUE</option><option value="20000">20,000 DECISIONS / PRIZE SEASON</option></select><small>Veil Arena calculates repeated rounds from the final roster and spreads them across the competition window.</small></label>
                {templateId === "custom" ? <>
                  <label>PAIRING STYLE<select value={customPairingMode} onChange={(event) => setCustomPairingMode(event.target.value as TournamentPairingMode)}><option value="sampled_rounds">RANDOM ROUNDS UNTIL LOCK</option><option value="round_robin">EVERY AGENT MEETS</option><option value="duel_series">TWO-AGENT SERIES</option><option value="gauntlet">BENCHMARK GAUNTLET</option></select></label>
                  <label>WHO CAN ENTER<select value={entryMode} onChange={(event) => {
                    const nextEntryMode = event.target.value as Season["entryMode"];
                    setEntryMode(nextEntryMode);
                    if (nextEntryMode === "invite_only") setCustomResubmission("fixed");
                  }}><option value="open">ANY SIGNED-IN WALLET</option><option value="invite_only">PRIVATE LINK HOLDERS</option></select></label>
                  <label>ENTRY LIMIT<input type="number" min="2" max="32" value={maxEntries} onChange={(event) => setMaxEntries(event.target.value)} required /></label>
                  <label>HANDS PER MATCH<input type="number" min="1" max="100" value={customHands} onChange={(event) => setCustomHands(event.target.value)} required /></label>
                  <label>AGENT UPDATES<select value={customResubmission} onChange={(event) => setCustomResubmission(event.target.value as TournamentResubmissionPolicy)}><option value="replace_until_lock" disabled={entryMode === "invite_only"}>REPLACE UNTIL LOCK</option><option value="fixed">FIXED AFTER ENTRY</option></select></label>
                </> : null}
                {draftRequiresFunding ? <fieldset className="operator-reward-fieldset">
                  <legend>REWARD</legend>
                  <div className="operator-reward-fields">
                    <label>PAYMENT TOKEN<select value={prizeTokenId} onChange={(event) => setPrizeTokenId(event.target.value as ArenaPrizeTokenId)}><option value="USDC">USDC / USD Coin</option><option value="STRK">STRK / Starknet Token</option></select></label>
                    <label>AMOUNT<input value={prizeAmount} onChange={(event) => setPrizeAmount(event.target.value)} inputMode="decimal" placeholder={prizeTokenId === "USDC" ? "Enter amount" : "Enter amount"} aria-describedby="create-reward-help" required /><small id="create-reward-help">You choose the exact amount. Wallet approval uses this value.</small></label>
                    <label>PAYOUT<select value={rewardDistribution} onChange={(event) => setRewardDistribution(event.target.value as TournamentRewardDistribution)}><option value="winner_takes_all">WINNER TAKES ALL</option><option value="top_3">TOP 3 / 50 · 30 · 20%</option><option value="top_5">TOP 5 / 40 · 25 · 15 · 10 · 10%</option><option value="top_8">TOP 8 / 30 · 20 · 15 · 10 · 8 · 7 · 5 · 5%</option><option value="top_10">TOP 10 / RANKED SHARE</option></select><small>Ranked agents receive the pool in this order after the season ends.</small></label>
                    <div className="operator-reward-note"><strong>{rewardDistributionCopy(rewardDistribution)}</strong><span>Percentages are committed with the season rules. Payouts stay private through STRK20.</span></div>
                  </div>
                </fieldset> : <div className="operator-freepass-note"><strong>Freepass competition</strong><span>No reward pool or wallet transaction. Players can enter before the lock time.</span></div>}
                {draftRules ? <div className="operator-rule-preview" role="status">
                  <span>{draftRules.pairingMode.replaceAll("_", " ").toUpperCase()}</span>
                  <strong>{draftRules.entryLimit === "unlimited" ? `${draftRules.minEntries}+ agents until lock` : `${draftRules.minEntries}-${draftRules.maxEntries} agents`} / {draftRules.handsPerMatch} duplicate deals per match / {(draftRules.qualificationHands ?? 0).toLocaleString()} decisions to qualify</strong>
                  <small>Publish opens entry immediately. Agents meet in sampled rounds after the season locks. One entry per exact strategy. Strategies and detailed table playback stay sealed from non-participants.</small>
                </div> : <div className="operator-rule-preview is-error" role="alert">The custom limits do not form a valid tournament.</div>}
                <button className="operator-button operator-button-dark" type="submit" disabled={busy !== ""}>{busy === "create" ? "PUBLISHING" : "PUBLISH COMPETITION"}<span>+</span></button>
              </form>
              {projectId ? <div className="operator-season-list">
                <div className="operator-subhead"><span>YOUR SEASONS</span><small>{openSeasons.length} OPEN</small></div>
                {seasons.map((season) => <button type="button" key={season.id} className={`operator-season-row ${schedule?.season.id === season.id ? "is-selected" : ""}`} onClick={() => void loadSchedule(season.id)}><span>{season.status.toUpperCase()}</span><strong>{season.name}</strong><small>{season.entryCount}{season.entryLimit === "unlimited" ? "+" : `/${season.maxEntries}`} ENTRIES / {(season.templateId ?? "LEGACY").replaceAll("_", " ").toUpperCase()}</small></button>)}
                {!seasons.length ? <p className="operator-muted">No seasons are recorded for this project.</p> : null}
              </div> : <p className="operator-create-note">Sign in with the operator wallet. Your private competition workspace is created when you publish.</p>}
            </section> : null}

            {projectId ? <section className="operator-panel" aria-labelledby="strategy-title">
              <header className="operator-panel-head"><div><span>02 / SEALED ROSTER</span><h2 id="strategy-title">Choose agents</h2></div><strong>{strategies.length} SEALED</strong></header>
              <p className="operator-panel-copy">Registering an agent adds its sealed package to this competition&apos;s roster. The operator sees the name and commitment, never the strategy. After the draw locks, only registered agents can play.</p>
              <div className="operator-strategy-list">
                {strategies.map((strategy) => { const active = selectedAgents.includes(strategy.agentId); const alreadyInSeason = schedule?.entries.some((entry) => entry.agentId === strategy.agentId); return <label className={`operator-strategy ${active ? "is-selected" : ""} ${alreadyInSeason ? "is-registered" : ""}`} key={strategy.agentId}><input type="checkbox" checked={active} disabled={alreadyInSeason || schedule?.season.status !== "open"} onChange={() => setSelectedAgents((current) => current.includes(strategy.agentId) ? current.filter((id) => id !== strategy.agentId) : [...current, strategy.agentId])} /><span className="operator-check">{active ? "✓" : ""}</span><span><strong>{strategy.displayName}</strong><small>{strategy.agentId} / {shortCommitment(strategy.artifactCommitment)}</small></span><em>{alreadyInSeason ? "IN" : "SEALED"}</em></label>; })}
                {!strategies.length ? <p className="operator-muted">No sealed strategies are available for this project.</p> : null}
              </div>
              <button type="button" className="operator-button operator-button-signal operator-full-button" disabled={!schedule || schedule.season.status !== "open" || !selectedAgents.length || busy !== ""} onClick={() => void registerSelectedAgents()}>{busy === "register" ? "ADDING TO ROSTER" : `ADD ${selectedAgents.length || "SELECTED"} AGENTS TO ROSTER`}<span>↓</span></button>
            </section> : null}

            {schedule ? <section className="operator-panel operator-panel-wide" aria-labelledby="schedule-title">
              <header className="operator-panel-head"><div><span>03 / DRAW CONTROL</span><h2 id="schedule-title">{schedule.season.name}</h2></div><strong>{schedule.season.status.toUpperCase()}</strong></header>
              <div className="operator-schedule-meta"><span>{schedule.entries.length} AGENTS</span><span>{schedule.season.workload?.pairingCount ?? schedule.matches.length} PAIRINGS</span><span>{(schedule.season.templateId ?? "LEGACY").replaceAll("_", " ").toUpperCase()}</span>{schedule.season.rules && usesStrk20RewardRail(schedule.season.rules) ? <span>STRK20 REWARD RAIL</span> : null}<span>LOCK {readableDate(schedule.season.locksAt)}</span>{schedule.season.rulesCommitment ? <span>RULES {shortCommitment(schedule.season.rulesCommitment)}</span> : null}</div>
              {schedule.season.status === "open" && schedule.season.entryMode === "invite_only" && prizePool?.status !== "funded" ? <aside className="operator-next-action" role="status">
                <div><span>PRIVATE ENTRY</span><strong>Fund the reward to unlock the join link.</strong><small>The private link is created only after the pool is successfully funded. The reward section below is the next step.</small></div>
              </aside> : null}
              {schedule.season.status === "open" && schedule.season.entryMode === "invite_only" && prizePool?.status === "funded" ? <div className="operator-invite-bar">
                <div><span>SHARE THE COMPETITION</span><strong>One join link. Copy it, share it, or join now.</strong><small>The link grants entry to this competition only. Strategies and payout details remain sealed.</small></div>
                {!privateInvitation ? <button type="button" className="operator-button operator-button-signal" onClick={() => void createPrivateInvitation()} disabled={busy !== ""}>{busy === "invitation" ? "CREATING LINK" : "CREATE JOIN LINK"}<span>↗</span></button> : null}
                {privateInvitation ? <div className="operator-invite-share">
                  <div className="operator-invite-qr">
                    {privateInvitationQr?.invitation === privateInvitation ? <Image src={privateInvitationQr.dataUrl} alt="QR code for the competition join link" width={220} height={220} unoptimized /> : <span>PREPARING QR</span>}
                  </div>
                  <div className="operator-invite-link">
                    <label htmlFor="private-join-link">JOIN LINK</label>
                    <input id="private-join-link" aria-label="Competition join link" value={privateInvitation} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <div className="operator-invite-actions">
                      <button type="button" className="operator-button operator-button-dark" onClick={() => void copyExistingInvitation()}>COPY LINK <span>↗</span></button>
                      <Link className="operator-button operator-button-dark" href={privateInvitation}>JOIN <span>→</span></Link>
                    </div>
                  </div>
                </div> : null}
              </div> : null}
              {schedule.season.status === "open" ? <div className="operator-lock-bar">
                {schedule.season.rules?.pairingMode === "gauntlet" ? <label htmlFor="benchmark-agent">SEALED BENCHMARK<select id="benchmark-agent" value={benchmarkAgentId} onChange={(event) => setBenchmarkAgentId(event.target.value)}><option value="">CHOOSE AN ENROLLED AGENT</option>{schedule.entries.map((entry) => <option value={entry.agentId} key={entry.id}>{entry.displayName.toUpperCase()}</option>)}</select></label> : null}
                <p>Locking freezes the roster and committed rules, then creates the exact match list. The worker locks automatically when the deadline arrives; this button is available if you want to lock early. Strategies remain sealed.</p>
                <button type="button" className="operator-button operator-button-dark" onClick={() => void lockSeason()} disabled={busy !== "" || schedule.entries.length < (schedule.season.rules?.minEntries ?? 2) || (schedule.season.rules?.pairingMode === "gauntlet" && !benchmarkAgentId)}>{busy === "lock" ? "LOCKING" : "LOCK DRAW"}<span>→</span></button>
              </div> : null}
              <div className="operator-match-list">
                {lockedMatches.map((match) => <article className="operator-match-row" key={match.id}><span className="operator-sequence">{String(match.sequence).padStart(2, "0")}</span><div><strong>{match.leftAgentId.toUpperCase()} <b>VS</b> {match.rightAgentId.toUpperCase()}</strong><small>{match.hands} HANDS / {match.status.toUpperCase()}{match.matchId ? ` / ${shortCommitment(match.matchId)}` : ""}</small></div><button type="button" className="operator-run-button" onClick={() => void runMatch(match)} disabled={match.status === "completed" || match.status === "running" || busy !== ""}>{busy === `run-${match.id}` ? "RUNNING" : match.status === "completed" ? "DONE" : "RUN"}</button></article>)}
                {!lockedMatches.length ? <p className="operator-muted">Lock the season to create real pairings.</p> : null}
              </div>
            </section> : null}

            {latestMatch && schedule ? <section className="operator-result" aria-labelledby="result-title"><header><span>04 / LAST EXECUTION</span><strong>PUBLIC RECEIPT READY</strong></header><div><h2 id="result-title">{latestMatch.players.map((player) => player.displayName.toUpperCase()).join(" / ")}</h2><p><b>{latestMatch.players.map((player) => latestMatch.score[player.agentId] ?? 0).join(" : ")}</b> score / {latestMatch.signedReceipt ? "signed receipt" : "receipt committed"}</p><code>TRANSCRIPT {shortCommitment(latestMatch.transcriptRoot)}</code></div><Link className="operator-button operator-button-dark" href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(schedule.season.id)}`}>OPEN COMPETITION ROOM <span>↗</span></Link></section> : null}

            {schedule && (schedule.season.status === "open" || schedule.season.status === "locked") && (schedule.season.rules?.rewardPolicy === "funded_before_start" || prizePool || schedule.season.entryMode === "invite_only") ? <section className="operator-panel operator-panel-wide" aria-labelledby="pool-title">
              <header className="operator-panel-head"><div><span>05 / REWARD{schedule.season.rules && usesStrk20RewardRail(schedule.season.rules) ? " / STRK20 PRIVATE RAIL" : ""}</span><h2 id="pool-title">Reward and payout</h2></div><strong>{prizePool?.status.replaceAll("_", " ").toUpperCase() ?? "FREEPASS"}</strong></header>
              <p className="operator-panel-copy">The connected Starknet wallet approves the exact amount. Veil Arena verifies the STRK20 receipt and never holds the sponsor balance. Public freepass competitions skip this section; private join links unlock after funding.</p>
              {!prizePool ? <form className="operator-form operator-pool-form" onSubmit={(event) => void createPrizePool(event)}>
                <label>PRIZE TOKEN<select value={prizeTokenId} onChange={(event) => setPrizeTokenId(event.target.value as ArenaPrizeTokenId)}><option value="USDC">USDC / USD Coin</option><option value="STRK">STRK / Starknet Token</option></select><small>Starknet Mainnet token. The wallet will approve this choice.</small></label>
                <label>PRIZE AMOUNT<input value={prizeAmount} onChange={(event) => setPrizeAmount(event.target.value)} inputMode="decimal" placeholder={prizeTokenId === "USDC" ? "10.00" : "1.00"} aria-describedby="prize-amount-help" required /><small id="prize-amount-help">Enter {selectedPrizeToken.symbol} in normal units. The exact on-chain amount is prepared automatically.</small></label>
                <button className="operator-button operator-button-signal" type="submit" disabled={busy !== ""}>{busy === "pool-create" ? "PREPARING" : "SET REWARD"}<span>→</span></button>
              </form> : null}
              {prizePool && (prizePool.status === "funding_pending" || prizePool.status === "unknown") ? (
                <div className="operator-chain-step">
                  <div>
                    <span>WALLET APPROVAL</span>
                    <strong>Approve the reward in your wallet</strong>
                    <small>{formatTokenAmountFromMinor(prizePool.amountMinor, prizePool.tokenSymbol === "STRK" ? 18 : 6)} {prizePool.tokenSymbol} / Starknet private reward pool</small>
                  </div>
                  <div className="operator-chain-actions">
                    {!fundingAccount ? <WalletPicker wallets={wallets} disabled={busy !== ""} onSelect={(wallet) => void connectFundingWallet(wallet)} /> : null}
                    {fundingAccount && !fundingPlan ? <button type="button" className="operator-button operator-button-signal" onClick={() => void prepareFundingPlan()} disabled={busy !== ""}>{busy === "pool-plan" ? "PREPARING" : "FUND REWARD"}<span>→</span></button> : null}
                    {fundingPlan && fundingAccount ? <><span className="operator-wallet-connected">{fundingWalletName.toUpperCase()} READY</span><button type="button" className="operator-button operator-button-signal" onClick={() => void prepareWalletFunding()} disabled={busy !== "" || fundingPrepared}>{busy === "funding-prepare" ? "CHECKING" : fundingWalletOutcome?.kind === "error" ? "TRY AGAIN" : fundingPrepared ? "PREPARED" : "CHECK WALLET"}<span>→</span></button><button type="button" className="operator-button operator-button-dark" onClick={() => void submitWalletFunding()} disabled={busy !== "" || !fundingPrepared}>{busy === "funding-submit" ? "WAITING" : "OPEN WALLET"}<span>↗</span></button></> : null}
                    {fundingHash ? <label className="operator-inline-field">TRANSACTION HASH<input value={fundingHash} onChange={(event) => setFundingHash(event.target.value)} placeholder="0x..." /></label> : null}
                    {fundingHash ? <button type="button" className="operator-button operator-button-dark" onClick={() => void confirmFunding()} disabled={busy !== "" || !fundingPlan || !fundingAccount}>{busy === "pool-funding" ? "SIGNING" : "SIGN AND VERIFY"}<span>↗</span></button> : null}
                  </div>
                  {fundingPlan ? <div className="operator-plan" aria-label="Prepared reward approval"><span>{fundingPlan.network} / WALLET APPROVAL</span><code>{formatTokenAmountFromMinor(fundingPlan.amountMinor, fundingPlan.tokenSymbol === "STRK" ? 18 : 6)} {fundingPlan.tokenSymbol} / reward funding</code><small>{fundingAccount ? "Review and approve this exact reward in the connected wallet." : "Connect the sponsor wallet to review and approve the reward."}</small></div> : null}
                  <small className="operator-wallet-note">Your wallet approves the reward. Veil Arena verifies the receipt and never holds the balance.</small>
                  {walletOutcomeCopy(fundingWalletOutcome) ? <small className="operator-wallet-note">{walletOutcomeCopy(fundingWalletOutcome)}</small> : null}
                </div>
              ) : null}
              {prizePool?.status === "funded" && schedule.season.status === "open" ? <div className="operator-chain-step"><div><span>REWARD FUNDED</span><strong>The competition now shows a funded reward</strong><small>Entry stays open until you lock the draw. The sponsor keeps custody until payout.</small></div></div> : null}
              {prizePool?.status === "funded" && schedule.season.status === "locked" ? <div className="operator-chain-step"><div><span>REWARD FUNDED</span><strong>Finish every pairing before preparing the ranked payout</strong><small>The configured ranks receive the pool through private STRK20 transfers.</small></div><button type="button" className="operator-button operator-button-dark" onClick={() => void prepareSettlement()} disabled={busy !== ""}>{busy === "pool-settlement" ? "SELECTING" : "PREPARE PAYOUT"}<span>→</span></button></div> : null}
              {prizePool?.status === "settlement_pending" ? <div className="operator-chain-step"><div><span>WINNER SELECTED / {prizePool.winnerAgentId?.toUpperCase()}</span><strong>Approve the private winner payment</strong><small>The winning participant receives the reward at the wallet recorded when their agent entered.</small></div><div className="operator-chain-actions">{settlementPlan && !fundingAccount ? <WalletPicker wallets={wallets} disabled={busy !== ""} onSelect={(wallet) => void connectFundingWallet(wallet)} /> : null}{settlementPlan && fundingAccount ? <><span className="operator-wallet-connected">{fundingWalletName.toUpperCase()} READY</span><button type="button" className="operator-button operator-button-signal" onClick={() => void prepareWalletSettlement()} disabled={busy !== "" || settlementPrepared}>{busy === "settlement-prepare" ? "CHECKING" : settlementPrepared ? "PREPARED" : "REVIEW PAYOUT"}<span>→</span></button><button type="button" className="operator-button operator-button-dark" onClick={() => void submitWalletSettlement()} disabled={busy !== "" || !settlementPrepared}>{busy === "settlement-submit" ? "WAITING" : "OPEN WALLET"}<span>↗</span></button></> : null}<label className="operator-inline-field">SETTLEMENT TRANSACTION HASH<input value={settlementHash} onChange={(event) => setSettlementHash(event.target.value)} placeholder="0x..." /></label><button type="button" className="operator-button operator-button-dark" onClick={() => void confirmSettlement()} disabled={busy !== "" || !settlementPlan || !fundingAccount || !settlementHash.trim()}>{busy === "pool-settlement-confirm" ? "SIGNING" : "VERIFY PAYMENT"}<span>↗</span></button></div>{settlementPlan ? <div className="operator-plan" aria-label="Prepared private winner payment"><span>{settlementPlan.network} / PRIVATE WINNER PAYMENT</span><code>{formatTokenAmountFromMinor(settlementPlan.amountMinor, settlementPlan.tokenSymbol === "STRK" ? 18 : 6)} {settlementPlan.tokenSymbol} / winning participant</code><small>{fundingAccount ? "Review and approve this exact payment in the connected wallet." : "Connect the sponsor wallet to review and approve the payment."}</small></div> : null}<small className="operator-wallet-note">The winner receives a private payment after the receipt is verified. The recipient stays sealed.</small>{walletOutcomeCopy(settlementWalletOutcome) ? <small className="operator-wallet-note">{walletOutcomeCopy(settlementWalletOutcome)}</small> : null}</div> : null}
              {prizePool?.status === "settled" ? <div className="operator-chain-complete"><span>SETTLEMENT COMPLETE</span><strong>{prizePool.winnerAgentId?.toUpperCase()} / PRIVATE REWARD VERIFIED</strong><small>The receipt and sponsor authorization are confirmed. The amount and recipient remain private.</small></div> : null}
            </section> : null}
        </div>
      </main>

      <footer className="operator-footer"><VeilLogo /><span>VEIL ARENA / OPERATOR DESK</span><span>YOUR WALLET SIGNS AND SUBMITS TRANSACTIONS</span></footer>
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
