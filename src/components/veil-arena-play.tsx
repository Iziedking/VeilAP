"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";
import { XMark } from "@/components/brand/x-mark";
import {
  agentPackageCommitment,
  parseAgentPackage,
  type AgentPackage,
} from "@/domain/arena/strategy-policy";
import { apiFetch } from "@/lib/api/client";

type SeasonStatus = "open" | "locked" | "completed" | "cancelled";
type PrizeStatus = "funding_pending" | "funded" | "settlement_pending" | "settled" | "unknown";

type ArenaSeason = {
  id: string;
  projectId: string;
  name: string;
  rulesetVersion: string;
  startsAt: string;
  locksAt: string;
  endsAt: string;
  status: SeasonStatus;
  entryMode: "invite_only" | "open";
  maxEntries: number;
  entryCount: number;
  prizeStatus?: PrizeStatus;
  templateId?: string;
  rules?: {
    resubmissionPolicy: "fixed" | "replace_until_lock";
    pairingMode: "round_robin" | "duel_series" | "gauntlet";
    handsPerMatch: number;
    encountersPerPair: number;
    revealPolicy: "loser_action_only";
  };
};

type Enrollment = {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  version: number;
  joinedAt: string;
  versions: Array<{
    version: number;
    agentId: string;
    displayName: string;
    artifactCommitment: string;
    status: "active" | "retired";
    submittedAt: string;
    retiredAt?: string;
  }>;
};

type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; code: string };
type LoadState = "idle" | "loading" | "ready" | "error";
type SessionState = "checking" | "authenticated" | "signed-out" | "unavailable";
type ClaimState = "idle" | "loading" | "loaded" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";
type XIdentity = {
  username: string;
  profileImageUrl: string | null;
  connectedAt: string;
  lastVerifiedAt: string;
};

function xVerificationMessage(result: string | null): string {
  if (!result) return "";
  const messages: Record<string, string> = {
    verified: "X account verified. You can now approve the agent entry.",
    cancelled: "X verification was cancelled. Your agent was not submitted.",
    expired: "The X verification request expired. Start it again when you are ready.",
    rate_limited: "X is temporarily limiting verification requests. Wait a moment, then try again.",
    wallet_mismatch: "The wallet changed during X verification. Sign in with the original wallet and try again.",
    x_account_already_linked: "That X account is already connected to another Veil Arena wallet.",
    x_wallet_already_linked: "This wallet is already connected to a different X account.",
    failed: "X could not verify this account. Nothing was submitted. Try again.",
  };
  return messages[result] ?? messages.failed;
}

function isJoinable(season: ArenaSeason, now: number, invitedSeasonId = ""): boolean {
  const entryAllowed = season.entryMode === "open"
    || (season.entryMode === "invite_only" && season.id === invitedSeasonId);
  return season.status === "open"
    && entryAllowed
    && season.entryCount < season.maxEntries
    && new Date(season.startsAt).getTime() <= now
    && now < new Date(season.locksAt).getTime();
}

function acceptsReplacement(season: ArenaSeason, now: number): boolean {
  return season.status === "open"
    && season.entryMode === "open"
    && season.rules?.resubmissionPolicy === "replace_until_lock"
    && new Date(season.startsAt).getTime() <= now
    && now < new Date(season.locksAt).getTime();
}

function seasonStateLabel(season: ArenaSeason, now: number, invitedSeasonId = ""): string {
  if (season.entryMode !== "open" && season.id !== invitedSeasonId) return "INVITE ONLY";
  if (season.status === "cancelled") return "CANCELLED";
  if (season.status === "completed") return "COMPLETED";
  if (season.status === "locked" || now >= new Date(season.locksAt).getTime()) return "ENTRY LOCKED";
  if (now < new Date(season.startsAt).getTime()) return "OPENS SOON";
  if (season.entryCount >= season.maxEntries) {
    return acceptsReplacement(season, now) ? "IMPROVEMENTS OPEN" : "ARENA FULL";
  }
  return "OPEN TO PLAY";
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "TIME UNAVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function remainingLabel(season: ArenaSeason, now: number): string {
  const remaining = new Date(season.locksAt).getTime() - now;
  if (remaining <= 0) return "ENTRY CLOSED";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `LOCKS IN ${minutes} MIN`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `LOCKS IN ${hours} HR`;
  return `LOCKS ${timeLabel(season.locksAt).toUpperCase()}`;
}

function shortCommitment(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}...${value.slice(-10)}` : value;
}

function enrollmentMessage(code: string): string {
  const messages: Record<string, string> = {
    ARENA_SEASON_CLOSED: "Entry closed before this submission completed. Choose another open season.",
    ARENA_SEASON_FULL: "The final seat was taken. Choose another open season.",
    ARENA_SEASON_NOT_OPEN: "This season is no longer accepting agents.",
    ARENA_SEASON_NOT_PUBLIC: "This season is not open to public players.",
    ARENA_INVITATION_INVALID: "This private invitation is not valid for this competition. Ask the host for a new link.",
    ARENA_INVITATION_EXPIRED: "This private invitation expired. Ask the host for a new link.",
    ARENA_SEASON_NOT_STARTED: "This season has not opened yet.",
    ARENA_WALLET_ALREADY_ENTERED: "This wallet already has an agent in the selected season.",
    ARENA_REPLACEMENT_CONFIRMATION_REQUIRED: "Your current agent is still active. Confirm replacement before submitting the new version.",
    ARENA_RESUBMISSION_FORBIDDEN: "This tournament uses a fixed roster. Its active agent cannot be replaced.",
    ARENA_REPLACEMENT_AGENT_ID_REQUIRED: "Give the improved package a new versioned agent ID, such as NIGHTJAR_V2.",
    ARENA_SUBMISSION_LIMIT_REACHED: "You have used today's three accepted submissions for this tournament. Try again after 00:00 UTC.",
    ARENA_ENTRY_VERSION_CONFLICT: "Your active agent changed during submission. Reload the entry before trying again.",
    STRATEGY_ARTIFACT_ALREADY_EXISTS: "That agent handle is already taken. Choose a different one.",
    IDEMPOTENCY_KEY_REUSED: "The submission changed during a retry. Review it and submit again.",
    AUTH_REQUIRED: "Your secure session expired. Sign in again before entering.",
    CONFIGURATION_MISSING: "Private strategy encryption is not configured on the server yet.",
    INVALID_INPUT: "The agent package is invalid or no longer matches this entry. Validate it and try again.",
    AGENT_ENGINE_MISMATCH: "This package targets a different game engine. Rebuild it using the engine shown for this competition.",
    X_VERIFICATION_REQUIRED: "Connect your X account before approving this agent entry.",
    X_VERIFICATION_UNAVAILABLE: "X verification is unavailable right now. Nothing was submitted. Try again when the service is restored.",
  };
  return messages[code] ?? "The agent could not be entered. Nothing was submitted. Try again.";
}

type PackageReview =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | {
      status: "ready";
      agent: Pick<AgentPackage, "agentId" | "displayName" | "protocolVersion" | "engineVersion"> & { ruleCount: number };
      commitment: string;
      agentPackage?: AgentPackage;
      submissionToken?: string;
      checks: Array<{ label: string; detail: string }>;
    };

function reviewAgentPackage(value: string): PackageReview {
  if (!value.trim()) return { status: "empty" };
  if (new TextEncoder().encode(value).byteLength > 64 * 1024) {
    return { status: "invalid", message: "The package is larger than the 64 KB protocol limit." };
  }
  try {
    const agentPackage = parseAgentPackage(JSON.parse(value));
    return {
      status: "ready",
      agent: {
        agentId: agentPackage.agentId,
        displayName: agentPackage.displayName,
        protocolVersion: agentPackage.protocolVersion,
        engineVersion: agentPackage.engineVersion,
        ruleCount: agentPackage.policy.rules.length,
      },
      agentPackage,
      commitment: agentPackageCommitment(agentPackage),
      checks: [
        { label: "Package format", detail: "Valid Veil Agent Protocol v1 JSON" },
        { label: "Safety boundary", detail: "Declarative fields only; no executable files or unknown fields" },
        { label: "Deterministic policy", detail: `${agentPackage.policy.rules.length} legal-action rules ready for the sealed runner` },
        { label: "Commitment", detail: "Canonical fingerprint generated for this exact package" },
      ],
    };
  } catch {
    return { status: "invalid", message: "This is not a valid Veil Agent Protocol v1 package." };
  }
}

export function VeilArenaPlay({
  defaultProjectId,
  defaultSeasonId,
  invitationToken,
}: {
  defaultProjectId: string;
  defaultSeasonId: string;
  invitationToken: string;
}) {
  const [discoveredProjectId, setDiscoveredProjectId] = useState(defaultProjectId);
  const projectId = discoveredProjectId;
  const invitedSeasonId = invitationToken ? defaultSeasonId : "";
  const signInReturnTo = invitationToken
    ? `/play?project=${encodeURIComponent(projectId)}&season=${encodeURIComponent(defaultSeasonId)}&invite=${encodeURIComponent(invitationToken)}`
    : `/play?project=${encodeURIComponent(projectId)}`;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [seasons, setSeasons] = useState<ArenaSeason[]>([]);
  const [seasonError, setSeasonError] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState(defaultSeasonId);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [walletAddress, setWalletAddress] = useState("");
  const [xConfigured, setXConfigured] = useState(false);
  const [xIdentity, setXIdentity] = useState<XIdentity | null>(null);
  const [xConnecting, setXConnecting] = useState(false);
  const [xMessage, setXMessage] = useState("");
  const [entryState, setEntryState] = useState<LoadState>("idle");
  const [entry, setEntry] = useState<Enrollment | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [agentPackageText, setAgentPackageText] = useState("");
  const [guideCopyState, setGuideCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [claimMessage, setClaimMessage] = useState("");
  const [claimedPackage, setClaimedPackage] = useState<Extract<PackageReview, { status: "ready" }> | null>(null);
  const [savedAgents, setSavedAgents] = useState<Array<{
    id: string;
    agentId: string;
    displayName: string;
    engineVersion: string;
    artifactCommitment: string;
    version: number;
  }>>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [replacementMode, setReplacementMode] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [entryRefresh, setEntryRefresh] = useState(0);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (projectId) return;
    let active = true;
    void apiFetch("/api/competitions")
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<Array<{ projectId: string }>>;
        if (!active) return;
        if (!response.ok || !body.ok) {
          setLoadState("error");
          setSeasonError("The public arena could not be discovered on this deployment.");
          return;
        }
        const firstProjectId = body.value[0]?.projectId;
        if (firstProjectId) setDiscoveredProjectId(firstProjectId);
        else setLoadState("ready");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
        setSeasonError("The public arena could not be discovered on this deployment.");
      });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || claimState !== "idle") return;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const token = parameters.get("submission");
    if (!token) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setClaimState("loading");
      try {
        const response = await apiFetch("/api/agent-submissions/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await response.json() as ApiEnvelope<{
          projectId: string;
          seasonId: string;
          agent: Pick<AgentPackage, "agentId" | "displayName" | "protocolVersion" | "engineVersion"> & { ruleCount: number };
          artifactCommitment: string;
          expiresAt: string;
        }>;
        if (!active) return;
        if (!response.ok || !body.ok || body.value.projectId !== projectId) {
          setClaimState("error");
          setClaimMessage("This private submission link is invalid, expired, or belongs to another arena.");
          return;
        }
        setSelectedSeasonId(body.value.seasonId);
        setClaimedPackage({
          status: "ready",
          agent: body.value.agent,
          commitment: body.value.artifactCommitment,
          submissionToken: token,
          checks: [
            { label: "Secure submission", detail: "Received through the signed coding-agent handoff" },
            { label: "Protocol", detail: `${body.value.agent.protocolVersion} / ${body.value.agent.engineVersion}` },
            { label: "Commitment", detail: "Matches the package sealed for this challenge" },
          ],
        });
        setReplacementMode(true);
        setClaimState("loaded");
        setClaimMessage(`Secure package received. Its strategy remains server-side. Check commitment ${shortCommitment(body.value.artifactCommitment)}, then approve the entry.`);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } catch {
        if (!active) return;
        setClaimState("error");
        setClaimMessage("The private submission link could not be checked. Ask the coding agent for a fresh link.");
      }
    });
    return () => {
      active = false;
    };
  }, [claimState, projectId]);

  useEffect(() => {
    let active = true;
    void apiFetch("/api/auth/session")
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<{
          walletAddress: string;
          xVerification: { configured: boolean; identity: XIdentity | null };
        } | null>;
        if (!active) return;
        if (response.ok && body.ok && body.value) {
          setWalletAddress(body.value.walletAddress);
          setXConfigured(body.value.xVerification.configured);
          setXIdentity(body.value.xVerification.identity);
          setSessionState("authenticated");
        } else {
          setSessionState("signed-out");
        }
      })
      .catch(() => {
        if (active) setSessionState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authenticated") return;
    let active = true;
    void apiFetch("/api/profile/agents")
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<typeof savedAgents>;
        if (active && response.ok && body.ok) setSavedAgents(body.value);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [sessionState]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("xVerification");
    if (!result) return;
    queueMicrotask(() => setXMessage(xVerificationMessage(result)));
    const url = new URL(window.location.href);
    url.searchParams.delete("xVerification");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    let active = true;
    const load = async () => {
      setLoadState((current) => current === "ready" ? current : "loading");
      try {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons`);
        const body = await response.json() as ApiEnvelope<ArenaSeason[]>;
        if (!active) return;
        if (!response.ok || !body.ok) {
          setLoadState("error");
          setSeasonError(body.ok ? "The arena could not be loaded." : body.code);
          return;
        }
        const ordered = [...body.value].sort((left, right) => (
          new Date(left.locksAt).getTime() - new Date(right.locksAt).getTime()
        ));
        setSeasons(ordered);
        const joinable = ordered.filter((season) => isJoinable(season, Date.now(), invitedSeasonId));
        setSelectedSeasonId((current) => (
          ordered.some((season) => season.id === current)
            ? current
            : ordered.some((season) => season.id === defaultSeasonId)
              ? defaultSeasonId
              : joinable[0]?.id ?? ordered[0]?.id ?? ""
        ));
        setSeasonError("");
        setLoadState("ready");
      } catch {
        if (active) {
          setLoadState("error");
          setSeasonError("The arena API could not be reached.");
        }
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [defaultSeasonId, invitedSeasonId, projectId]);

  const joinableSeasons = useMemo(
    () => seasons.filter((season) => isJoinable(season, now, invitedSeasonId)),
    [invitedSeasonId, now, seasons],
  );
  const visibleSeasons = invitationToken
    ? seasons.filter((season) => season.id === invitedSeasonId)
    : seasons;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const selectedSeasonJoinable = selectedSeason ? isJoinable(selectedSeason, now, invitedSeasonId) : false;
  const localPackageReview = useMemo(() => reviewAgentPackage(agentPackageText), [agentPackageText]);
  const packageReview = claimedPackage ?? localPackageReview;

  async function loadSavedAgent(agentId: string) {
    setSaveMessage("");
    try {
      const response = await apiFetch(`/api/profile/agents/${encodeURIComponent(agentId)}`);
      const body = await response.json() as ApiEnvelope<{ agentPackage: AgentPackage }>;
      if (!response.ok || !body.ok) {
        setSaveMessage("That saved package could not be opened. Nothing was changed.");
        return;
      }
      setClaimedPackage(null);
      setAgentPackageText(JSON.stringify(body.value.agentPackage, null, 2));
      setSaveState("idle");
      setSaveMessage(`${agentId} loaded from your private agent library.`);
    } catch {
      setSaveMessage("Your saved package could not be reached. Try again in a moment.");
    }
  }

  async function saveAgent() {
    if (sessionState !== "authenticated" || packageReview.status !== "ready" || !packageReview.agentPackage || saveState === "saving") return;
    setSaveState("saving");
    setSaveMessage("");
    try {
      const response = await apiFetch("/api/profile/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPackage: packageReview.agentPackage }),
      });
      const body = await response.json() as ApiEnvelope<typeof savedAgents[number]>;
      if (!response.ok || !body.ok) {
        setSaveState("error");
        setSaveMessage("The package passed local review but could not be saved. Nothing was entered.");
        return;
      }
      setSavedAgents((current) => [body.value, ...current.filter((agent) => agent.agentId !== body.value.agentId)]);
      setSaveState("saved");
      setSaveMessage(joinableSeasons.length > 0
        ? "Saved to your private agent library. Choose an open arena above, or pass for now."
        : "Saved to your private agent library. No open arena is required to keep it here.");
    } catch {
      setSaveState("error");
      setSaveMessage("The agent library could not be reached. Nothing was entered.");
    }
  }

  useEffect(() => {
    if (sessionState !== "authenticated" || !projectId || !selectedSeasonId) {
      return;
    }
    let active = true;
    void apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(selectedSeasonId)}/join`)
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<Enrollment | null>;
        if (!active) return;
        if (response.status === 401) {
          setSessionState("signed-out");
          setEntry(null);
          setEntryState("ready");
          return;
        }
        if (!response.ok || !body.ok) {
          setEntryState("error");
          return;
        }
        setEntry(body.value);
        setEntryState("ready");
      })
      .catch(() => {
        if (active) setEntryState("error");
      });
    return () => {
      active = false;
    };
  }, [entryRefresh, projectId, selectedSeasonId, sessionState]);

  const currentEntry = entry?.seasonId === selectedSeasonId ? entry : null;
  const selectedSeasonAcceptsReplacement = selectedSeason ? acceptsReplacement(selectedSeason, now) : false;
  const canSubmitToSelectedSeason = currentEntry ? selectedSeasonAcceptsReplacement : selectedSeasonJoinable;

  useEffect(() => {
    if (!currentEntry || selectedSeason?.entryMode !== "invite_only") return;
    try {
      window.localStorage.setItem("veil-arena-private-room", JSON.stringify({
        projectId,
        seasonId: selectedSeason.id,
        name: selectedSeason.name,
      }));
    } catch {
      // The room link remains available in the confirmation panel if storage is blocked.
    }
  }, [currentEntry, projectId, selectedSeason]);

  useEffect(() => {
    if (!currentEntry || !selectedSeason) return;
    try {
      window.localStorage.setItem("veil-arena-last-entry", JSON.stringify({
        projectId,
        seasonId: selectedSeason.id,
        seasonName: selectedSeason.name,
        agentId: currentEntry.agentId,
        displayName: currentEntry.displayName,
      }));
    } catch {
      // The profile still reads persisted entries from the API when storage is blocked.
    }
  }, [currentEntry, projectId, selectedSeason]);

  function resetSubmission() {
    idempotencyKey.current = null;
    setSubmitError("");
    setReplacementConfirmed(false);
  }

  function updateAgentPackage(value: string) {
    setClaimedPackage(null);
    setAgentPackageText(value);
    setSaveState("idle");
    setSaveMessage("");
    resetSubmission();
  }

  async function importAgentPackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      setSubmitError("The package is larger than the 64 KB protocol limit.");
      event.target.value = "";
      return;
    }
    updateAgentPackage(await file.text());
    event.target.value = "";
  }

  async function copyAgentGuide() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/AGENT.md`);
      setGuideCopyState("copied");
    } catch {
      setGuideCopyState("error");
    }
  }

  async function connectXAccount() {
    if (sessionState !== "authenticated" || xConnecting) return;
    setXConnecting(true);
    setXMessage("");
    try {
      const response = await apiFetch("/api/auth/x/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: `${window.location.pathname}${window.location.search}` }),
      });
      const body = await response.json() as ApiEnvelope<{ authorizationUrl: string }>;
      if (!response.ok || !body.ok) {
        setXMessage(body.ok ? "X verification could not start." : enrollmentMessage(body.code));
        return;
      }
      window.location.assign(body.value.authorizationUrl);
    } catch {
      setXMessage("X verification could not start. Your agent was not submitted.");
    } finally {
      setXConnecting(false);
    }
  }

  async function enterArena(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSeason || !canSubmitToSelectedSeason || sessionState !== "authenticated") return;
    if (!xIdentity) {
      setSubmitError("Connect your X account before approving this agent entry.");
      return;
    }
    if (packageReview.status !== "ready") {
      setSubmitError(packageReview.status === "invalid" ? packageReview.message : "Import the package created by your coding agent first.");
      return;
    }
    const { agent, agentPackage, submissionToken } = packageReview;
    if (currentEntry && !replacementConfirmed) {
      setSubmitError("Confirm that this package should replace your active agent.");
      return;
    }
    const requestKey = idempotencyKey.current ?? `arena-entry-${crypto.randomUUID()}`;
    idempotencyKey.current = requestKey;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(selectedSeason.id)}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestKey,
          },
          body: JSON.stringify({
            agentId: agent.agentId,
            ...(submissionToken ? { submissionToken } : { policy: agentPackage }),
            replaceExisting: Boolean(currentEntry),
            ...(invitationToken && selectedSeason.id === invitedSeasonId ? { invitationToken } : {}),
          }),
        },
      );
      const body = await response.json() as ApiEnvelope<Enrollment>;
      if (!response.ok || !body.ok) {
        const code = body.ok ? "PERSISTENCE_FAILED" : body.code;
        if (code === "IDEMPOTENCY_KEY_REUSED") idempotencyKey.current = null;
        if (response.status === 401 || code === "UNAUTHENTICATED") setSessionState("signed-out");
        setSubmitError(enrollmentMessage(code));
        return;
      }
      setEntry(body.value);
      setEntryState("ready");
      setAgentPackageText("");
      setClaimedPackage(null);
      setSaveState("idle");
      setSaveMessage("");
      setReplacementMode(false);
      setReplacementConfirmed(false);
    } catch {
      setSubmitError("The arena API could not be reached. Your retry will use the same safe submission key.");
    } finally {
      setSubmitting(false);
    }
  }

  const statusMessage = !projectId
    ? "The public arena project is not configured on this deployment."
    : loadState === "loading"
      ? "Loading real seasons..."
      : loadState === "error"
        ? seasonError
        : seasons.length === 0
          ? invitationToken ? "This private competition could not be found." : "No public season has been created yet."
            : joinableSeasons.length === 0
              ? invitationToken ? "This private challenge is no longer accepting an agent." : "No public season is accepting agents right now."
              : invitationToken ? "Your private challenge is ready. Build an agent, then approve its entry." : "Choose a competition, give AGENT.md to a coding agent, then approve the package it returns.";
  let submitLabel = "APPROVE, SEAL AND ENTER";
  if (submitting) {
    submitLabel = "SEALING APPROVED PACKAGE...";
  } else if (!canSubmitToSelectedSeason) {
    submitLabel = selectedSeason
      ? "THIS ARENA IS NOT ACCEPTING ENTRIES"
      : "NO OPEN ARENA AVAILABLE";
  } else if (entryState !== "ready" && sessionState === "authenticated") {
    submitLabel = "CHECKING ENTRY...";
  } else if (!xIdentity) {
    submitLabel = "VERIFY X ACCOUNT TO ENTER";
  } else if (packageReview.status !== "ready") {
    submitLabel = "IMPORT A VALID AGENT PACKAGE";
  } else if (currentEntry && !replacementConfirmed) {
    submitLabel = "CONFIRM ACTIVE AGENT REPLACEMENT";
  } else if (currentEntry) {
    submitLabel = "APPROVE AND REPLACE ACTIVE AGENT";
  }

  return (
    <div className="play-page">
      <header className="play-nav">
        <Link className="play-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
        <Link className="play-back" href={invitationToken ? "/arena" : "/"}>← {invitationToken ? "Back to arena" : "Back to home"}</Link>
        <nav aria-label="Player navigation">
          <Link href="/arena">Watch arena</Link>
          <Link href="/sign-in">Wallet access</Link>
          <Link href="/profile">Profile</Link>
        </nav>
      </header>

      <main>
        <section className="play-hero" aria-labelledby="play-title">
          <span className="play-kicker">AGENT ENTRY</span>
          <h1 id="play-title">Prepare an agent for competition.</h1>
          <p>Give AGENT.md to a coding agent of your choice. Bring the completed package here, review it, then verify your wallet and X account before you enter.</p>
          <ol className="play-steps" aria-label="How to enter">
            <li><span>01</span><strong>Give AGENT.md to a coding agent</strong></li>
            <li><span>02</span><strong>Have it build and validate the package</strong></li>
            <li><span>03</span><strong>Review the package and sign in with your wallet</strong></li>
            <li><span>04</span><strong>Verify your X account and approve entry</strong></li>
          </ol>
        </section>

        <div className="play-workspace">
          <section className="play-seasons" aria-labelledby="season-title">
            <header>
              <div><span>01 / LIVE SEASONS</span><h2 id="season-title">Choose your arena</h2></div>
              <strong>{joinableSeasons.length} OPEN</strong>
            </header>
            <p className="play-status" aria-live="polite">{statusMessage}</p>

            <div className="play-season-list">
              {visibleSeasons.map((season) => {
                const joinable = isJoinable(season, now, invitedSeasonId);
                const replacementOpen = acceptsReplacement(season, now);
                const available = joinable || replacementOpen;
                const selected = season.id === selectedSeasonId;
                return (
                  <button
                    className={`play-season${selected ? " is-selected" : ""}${available ? "" : " is-unavailable"}`}
                    type="button"
                    key={season.id}
                    aria-pressed={selected}
                    aria-disabled={!available}
                    onClick={() => {
                      setSelectedSeasonId(season.id);
                      setEntry(null);
                      setEntryState("idle");
                      setReplacementMode(false);
                      resetSubmission();
                    }}
                  >
                    <span className="play-season-index">{String(visibleSeasons.indexOf(season) + 1).padStart(2, "0")}</span>
                    <span className="play-season-name"><strong>{season.name}</strong><small>{(season.templateId ?? season.rulesetVersion).replaceAll("_", " ")}</small></span>
                    <span><strong>{season.entryCount} / {season.maxEntries}</strong><small>AGENTS</small></span>
                    <span><strong>{seasonStateLabel(season, now, invitedSeasonId)}</strong><small>{season.prizeStatus === "funded" ? "FUNDED PRIVATE REWARD" : season.prizeStatus === "funding_pending" ? "REWARD PLEDGED" : "FREE CHALLENGE"} / {joinable ? remainingLabel(season, now) : timeLabel(season.locksAt)}</small></span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="play-builder" aria-labelledby="builder-title">
            <header>
              <div><span>02 / AGENT ENTRY</span><h2 id="builder-title">Bring your agent package</h2></div>
              <strong>{selectedSeasonJoinable ? "OPEN FOR ENTRY" : selectedSeason ? "VIEW ONLY" : "WAITING FOR SEASON"}</strong>
            </header>

            {currentEntry && (
              <div className="play-success">
                <span>ACTIVE ENTRY / VERSION {currentEntry.version}</span>
                <h3>{currentEntry.displayName} is sealed.</h3>
                <p>Your active strategy is encrypted. Earlier accepted versions remain sealed for audit, but only this version enters the locked roster. Open the private challenge room below to follow match history, receipts, and the leaderboard.</p>
                <dl>
                  <div><dt>ACTIVE AGENT</dt><dd>{currentEntry.agentId} / V{currentEntry.version}</dd></div>
                  <div><dt>ENTRY PROOF</dt><dd><code>{shortCommitment(currentEntry.artifactCommitment)}</code></dd></div>
                  <div><dt>IF YOU WIN</dt><dd>PAID PRIVATELY</dd></div>
                </dl>
                {currentEntry.versions.length > 1 && (
                  <section className="play-version-history" aria-labelledby="version-history-title">
                    <div><span>SEALED HISTORY</span><h4 id="version-history-title">Accepted versions</h4></div>
                    <ol>
                      {[...currentEntry.versions].reverse().map((version) => (
                        <li key={`${version.version}-${version.artifactCommitment}`}>
                          <strong>V{version.version} / {version.agentId}</strong>
                          <code>{shortCommitment(version.artifactCommitment)}</code>
                          <span>{version.status.toUpperCase()}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <div className="play-success-actions">
                  <Link className="play-primary" href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(selectedSeasonId)}`}>[ OPEN CHALLENGE ROOM ]</Link>
                  {selectedSeasonAcceptsReplacement && (
                    <button
                      className="play-secondary"
                      type="button"
                      onClick={() => {
                        setReplacementMode((current) => !current);
                        setReplacementConfirmed(false);
                        setSubmitError("");
                      }}
                    >[{replacementMode ? " CANCEL IMPROVEMENT " : " SUBMIT IMPROVED VERSION "}]</button>
                  )}
                  <Link className="play-secondary" href="/">[ BACK TO HOME ]</Link>
                </div>
                {!selectedSeasonAcceptsReplacement && <p className="play-roster-note">This tournament has a fixed roster or has reached its entry lock. The active version cannot change.</p>}
              </div>
            )}

            {(!currentEntry || replacementMode) && (
              <form className="play-form" onSubmit={enterArena}>
                <fieldset disabled={submitting}>
                  <legend className="sr-only">Import a Veil Agent Protocol package</legend>

                  <section className="play-agent-guide" aria-labelledby="agent-guide-title">
                    <div>
                      <span>START HERE</span>
                      <h3 id="agent-guide-title">Start with AGENT.md.</h3>
                      <p>Give the guide to a coding agent and ask for one <code>.veil-agent.json</code> package. The package contains the strategy Veil Arena checks before entry.</p>
                    </div>
                    <div className="play-agent-guide-actions">
                      <button type="button" onClick={copyAgentGuide}>[{guideCopyState === "copied" ? " GUIDE LINK COPIED " : " COPY AGENT.MD LINK "}]</button>
                      <a href="/AGENT.md" download>[ DOWNLOAD GUIDE ]</a>
                    </div>
                    {guideCopyState === "error" && <p className="play-inline-error" role="alert">Copy was blocked. Download the guide instead.</p>}
                  </section>

                  <section className="play-package-import" aria-labelledby="package-import-title">
                    <div className="play-package-import-head">
                      <div><span>PRIVATE PACKAGE</span><h3 id="package-import-title">Import the package from your coding agent</h3></div>
                      <label className="play-file-button">
                        <input type="file" accept="application/json,.json,.veil-agent.json" onChange={importAgentPackage} />
                        [ CHOOSE PACKAGE ]
                      </label>
                    </div>
                    <p className="play-package-intro">Importing starts a safety review. Save the sealed package to your private agent library first; entering a competition is a separate choice. The operator sees its name and commitment, not its strategy.</p>
                    {savedAgents.length > 0 && (
                      <div className="play-saved-agents" aria-label="Saved agents">
                        <span>SAVED IN YOUR PRIVATE LIBRARY</span>
                        {savedAgents.map((savedAgent) => (
                          <button type="button" key={savedAgent.id} onClick={() => void loadSavedAgent(savedAgent.agentId)}>
                            {savedAgent.displayName} / V{savedAgent.version}
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={agentPackageText}
                      onChange={(event) => updateAgentPackage(event.target.value)}
                      placeholder={claimedPackage ? "Secure HTTP submission loaded. The strategy remains server-side." : "Paste the complete .veil-agent.json package here"}
                      disabled={Boolean(claimedPackage)}
                      spellCheck={false}
                      aria-describedby="package-help"
                    />
                    <p id="package-help">Veil Arena checks the package before submission. It rejects executable code, unknown fields, and files larger than 64 KB.</p>
                    {claimState !== "idle" && <p className={`play-claim-status${claimState === "error" ? " is-error" : ""}`} role="status">{claimState === "loading" ? "Opening the package from your coding agent..." : claimMessage}</p>}
                    {packageReview.status === "invalid" && <p className="play-package-invalid" role="alert">{packageReview.message}</p>}
                  </section>
                </fieldset>

                <section className="play-review" aria-labelledby="review-title">
                  <div>
                    <span>PACKAGE REVIEW</span>
                    <h3 id="review-title">{packageReview.status === "ready" ? `${packageReview.agent.displayName} / ${packageReview.agent.agentId}` : "WAITING FOR A VALID AGENT PACKAGE"}</h3>
                  </div>
                  {packageReview.status === "ready" && (
                    <>
                      <div className="play-review-owner">
                        {xIdentity?.profileImageUrl ? (
                          <span className="play-x-avatar" role="img" aria-label={`X profile picture for @${xIdentity.username}`} style={{ backgroundImage: `url(${xIdentity.profileImageUrl})` }} />
                        ) : <span className="play-review-owner-fallback" aria-hidden="true">{xIdentity ? xIdentity.username.slice(0, 2).toUpperCase() : "VA"}</span>}
                        <span><strong>{xIdentity ? `@${xIdentity.username}` : "Wallet owner"}</strong><small>PRIVATE PACKAGE OWNER</small></span>
                      </div>
                      <dl className="play-package-facts">
                        <div><dt>PROTOCOL</dt><dd>{packageReview.agent.protocolVersion}</dd></div>
                        <div><dt>ENGINE</dt><dd>{packageReview.agent.engineVersion}</dd></div>
                        <div><dt>RULES</dt><dd>{packageReview.agent.ruleCount}</dd></div>
                        <div><dt>COMMITMENT</dt><dd><code>{shortCommitment(packageReview.commitment)}</code></dd></div>
                      </dl>
                      <ol className="play-validation-list" aria-label="Package validation">
                        {packageReview.checks.map((check) => <li key={check.label}><i /> <span><strong>{check.label}</strong><small>{check.detail}</small></span></li>)}
                      </ol>
                    </>
                  )}
                  <div className="play-privacy-grid">
                    <p><span>PUBLIC</span> Agent name, entry commitment, match score, and rank.</p>
                    <p><span>PRIVATE</span> Strategy rules, package contents, and the wallet that receives a reward.</p>
                  </div>
                  <details>
                    <summary>How privacy works</summary>
                    <p>Veil Arena encrypts the validated package before storing it. The trusted match runner opens it only while running the fixed game rules. This version does not use zero-knowledge execution.</p>
                  </details>
                </section>

                {currentEntry && (
                  <label className="play-replacement-confirmation">
                    <input
                      type="checkbox"
                      checked={replacementConfirmed}
                      onChange={(event) => {
                        setReplacementConfirmed(event.target.checked);
                        resetSubmission();
                        setReplacementConfirmed(event.target.checked);
                      }}
                    />
                    <span><strong>Replace version {currentEntry.version}</strong><small>The new package becomes active. Version {currentEntry.version} stays sealed in the audit history, and this tournament allows three accepted versions per UTC day.</small></span>
                  </label>
                )}

                {sessionState === "authenticated" ? (
                  <div className="play-wallet-state"><span>WALLET VERIFIED</span><strong>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</strong><small>This session can approve an arena entry. It cannot move funds.</small></div>
                ) : (
                  <div className="play-sign-in-callout">
                    <div><span>{sessionState === "checking" ? "CHECKING WALLET" : "SIGN IN TO ENTER"}</span><p>Your wallet approval links the agent and any reward to you.</p></div>
                    {sessionState !== "checking" && <Link href={`/sign-in?returnTo=${encodeURIComponent(signInReturnTo)}`}>[ SIGN IN WITH WALLET ]</Link>}
                  </div>
                )}

                {sessionState === "authenticated" && (
                  xIdentity ? (
                    <div className="play-wallet-state">
                      <div className="play-x-identity">
                        {xIdentity.profileImageUrl ? (
                          <span
                            className="play-x-avatar"
                            role="img"
                            aria-label={`X profile picture for @${xIdentity.username}`}
                            style={{ backgroundImage: `url(${xIdentity.profileImageUrl})` }}
                          />
                        ) : null}
                        <span className="play-x-label"><XMark /> X ACCOUNT VERIFIED</span>
                      </div>
                      <strong>@{xIdentity.username}</strong>
                      <small>This proves account control for entry. Veil Arena cannot post, follow, or read private messages.</small>
                      {xConfigured ? (
                        <button type="button" className="play-inline-action" onClick={connectXAccount} disabled={xConnecting}>
                          [ {xConnecting ? "OPENING X" : "REFRESH X PROFILE"} ]
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="play-sign-in-callout">
                      <div><span className="play-x-label"><XMark /> FINAL ENTRY CHECK</span><p>Connect a valid X account. Veil Arena records the account ID and handle, then discards the temporary access token.</p></div>
                      {xConfigured
                        ? <button type="button" onClick={connectXAccount} disabled={xConnecting}>[ {xConnecting ? "OPENING X" : "VERIFY WITH X"} ]</button>
                        : <strong>X VERIFICATION UNAVAILABLE</strong>}
                    </div>
                  )
                )}
                {xMessage && <p className="play-claim-status" role="status">{xMessage}</p>}
                {saveMessage && <p className={`play-save-message${saveState === "error" ? " is-error" : ""}`} role="status">{saveMessage}</p>}

                {submitError && <p className="play-error" role="alert">{submitError}</p>}
                {entryState === "error" && <div className="play-error play-entry-error" role="alert"><span>Your existing entry could not be checked. Nothing new was submitted.</span><button type="button" onClick={() => { setEntryState("loading"); setEntryRefresh((current) => current + 1); }}>CHECK AGAIN</button></div>}

                <div className="play-submit-actions">
                <button
                  className="play-save"
                  type="button"
                  onClick={() => void saveAgent()}
                  disabled={sessionState !== "authenticated" || packageReview.status !== "ready" || !packageReview.agentPackage || submitting || saveState === "saving"}
                >
                  <span>{saveState === "saving" ? "VALIDATING AND SAVING..." : saveState === "saved" ? "AGENT SAVED TO PROFILE" : "SAVE AGENT TO PROFILE"}</span>
                  <strong aria-hidden="true">↓</strong>
                </button>
                <button
                  className="play-submit"
                  type="submit"
                  disabled={!canSubmitToSelectedSeason || sessionState !== "authenticated" || !xIdentity || submitting || entryState !== "ready" || packageReview.status !== "ready" || Boolean(currentEntry && !replacementConfirmed)}
                >
                  <span>{submitLabel}</span>
                  <strong aria-hidden="true">↓</strong>
                </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </main>

      <footer className="play-footer">
        <VeilLogo />
        <span>OPEN COMPETITIONS / SEALED STRATEGIES</span>
        <span>REWARDS SHOW THEIR FUNDING STATUS</span>
      </footer>
    </div>
  );
}
