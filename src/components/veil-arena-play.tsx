"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";
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
};

type Enrollment = {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  joinedAt: string;
};

type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; code: string };
type LoadState = "idle" | "loading" | "ready" | "error";
type SessionState = "checking" | "authenticated" | "signed-out" | "unavailable";
type ClaimState = "idle" | "loading" | "loaded" | "error";

function isJoinable(season: ArenaSeason, now: number): boolean {
  return season.status === "open"
    && season.entryMode === "open"
    && season.entryCount < season.maxEntries
    && new Date(season.startsAt).getTime() <= now
    && now < new Date(season.locksAt).getTime();
}

function seasonStateLabel(season: ArenaSeason, now: number): string {
  if (season.entryMode !== "open") return "INVITE ONLY";
  if (season.status === "cancelled") return "CANCELLED";
  if (season.status === "completed") return "COMPLETED";
  if (season.status === "locked" || now >= new Date(season.locksAt).getTime()) return "ENTRY LOCKED";
  if (now < new Date(season.startsAt).getTime()) return "OPENS SOON";
  if (season.entryCount >= season.maxEntries) return "ARENA FULL";
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
    ARENA_SEASON_NOT_STARTED: "This season has not opened yet.",
    ARENA_WALLET_ALREADY_ENTERED: "This wallet already has an agent in the selected season.",
    STRATEGY_ARTIFACT_ALREADY_EXISTS: "That agent handle is already taken. Choose a different one.",
    IDEMPOTENCY_KEY_REUSED: "The submission changed during a retry. Review it and submit again.",
    AUTH_REQUIRED: "Your secure session expired. Sign in again before entering.",
    CONFIGURATION_MISSING: "Private strategy encryption is not configured on the server yet.",
    INVALID_INPUT: "The agent package is invalid or no longer matches this entry. Validate it and try again.",
  };
  return messages[code] ?? "The agent could not be entered. Nothing was submitted. Try again.";
}

type PackageReview =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ready"; agentPackage: AgentPackage; commitment: string };

function reviewAgentPackage(value: string): PackageReview {
  if (!value.trim()) return { status: "empty" };
  if (new TextEncoder().encode(value).byteLength > 64 * 1024) {
    return { status: "invalid", message: "The package is larger than the 64 KB protocol limit." };
  }
  try {
    const agentPackage = parseAgentPackage(JSON.parse(value));
    return {
      status: "ready",
      agentPackage,
      commitment: agentPackageCommitment(agentPackage),
    };
  } catch {
    return { status: "invalid", message: "This is not a valid Veil Agent Protocol v1 package." };
  }
}

export function VeilArenaPlay({ defaultProjectId }: { defaultProjectId: string }) {
  const projectId = defaultProjectId;
  const [loadState, setLoadState] = useState<LoadState>(defaultProjectId ? "loading" : "idle");
  const [seasons, setSeasons] = useState<ArenaSeason[]>([]);
  const [seasonError, setSeasonError] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [walletAddress, setWalletAddress] = useState("");
  const [entryState, setEntryState] = useState<LoadState>("idle");
  const [entry, setEntry] = useState<Enrollment | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [agentPackageText, setAgentPackageText] = useState("");
  const [guideCopyState, setGuideCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [claimState, setClaimState] = useState<ClaimState>("idle");
  const [claimMessage, setClaimMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [entryRefresh, setEntryRefresh] = useState(0);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
          agentPackage: AgentPackage;
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
        setAgentPackageText(JSON.stringify(body.value.agentPackage, null, 2));
        setClaimState("loaded");
        setClaimMessage(`Package received. Check commitment ${shortCommitment(body.value.artifactCommitment)}, then approve the entry.`);
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
        const body = await response.json() as ApiEnvelope<{ walletAddress: string } | null>;
        if (!active) return;
        if (response.ok && body.ok && body.value) {
          setWalletAddress(body.value.walletAddress);
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
        const joinable = ordered.filter((season) => isJoinable(season, Date.now()));
        setSelectedSeasonId((current) => (
          ordered.some((season) => season.id === current)
            ? current
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
  }, [projectId]);

  const joinableSeasons = useMemo(
    () => seasons.filter((season) => isJoinable(season, now)),
    [now, seasons],
  );
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const selectedSeasonJoinable = selectedSeason ? isJoinable(selectedSeason, now) : false;
  const packageReview = useMemo(() => reviewAgentPackage(agentPackageText), [agentPackageText]);

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

  function resetSubmission() {
    idempotencyKey.current = null;
    setSubmitError("");
  }

  function updateAgentPackage(value: string) {
    setAgentPackageText(value);
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

  async function enterArena(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSeason || !selectedSeasonJoinable || sessionState !== "authenticated") return;
    if (packageReview.status !== "ready") {
      setSubmitError(packageReview.status === "invalid" ? packageReview.message : "Import the package created by your coding agent first.");
      return;
    }
    const { agentPackage } = packageReview;
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
            agentId: agentPackage.agentId,
            policy: agentPackage,
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
          ? "No public season has been created yet."
            : joinableSeasons.length === 0
              ? "No public season is accepting agents right now."
              : "Choose a competition, give AGENT.md to a coding agent, then approve the package it returns.";
  const currentEntry = entry?.seasonId === selectedSeasonId ? entry : null;

  return (
    <div className="play-page">
      <header className="play-nav">
        <Link className="play-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
        <nav aria-label="Player navigation">
          <Link href="/#broadcast">Watch arena</Link>
          <Link href="/sign-in">Wallet access</Link>
        </nav>
      </header>

      <main>
        <section className="play-hero" aria-labelledby="play-title">
          <span className="play-kicker">NO CODING EXPERIENCE REQUIRED</span>
          <h1 id="play-title">Give the guide to a coding agent. Bring back a contender.</h1>
          <p>Copy AGENT.md into the coding agent you already use. It builds and checks the poker package. You review the result and approve the competition entry with your wallet.</p>
          <ol className="play-steps" aria-label="How to enter">
            <li><span>01</span><strong>Copy AGENT.md into your coding agent</strong></li>
            <li><span>02</span><strong>Ask it to build and validate your poker agent</strong></li>
            <li><span>03</span><strong>Review the package and approve entry with your wallet</strong></li>
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
              {seasons.map((season) => {
                const joinable = isJoinable(season, now);
                const selected = season.id === selectedSeasonId;
                return (
                  <button
                    className={`play-season${selected ? " is-selected" : ""}${joinable ? "" : " is-unavailable"}`}
                    type="button"
                    key={season.id}
                    aria-pressed={selected}
                    aria-disabled={!joinable}
                    onClick={() => {
                      setSelectedSeasonId(season.id);
                      setEntry(null);
                      setEntryState("idle");
                      resetSubmission();
                    }}
                  >
                    <span className="play-season-index">{String(seasons.indexOf(season) + 1).padStart(2, "0")}</span>
                    <span className="play-season-name"><strong>{season.name}</strong><small>{season.rulesetVersion}</small></span>
                    <span><strong>{season.entryCount} / {season.maxEntries}</strong><small>AGENTS</small></span>
                    <span><strong>{seasonStateLabel(season, now)}</strong><small>{season.prizeStatus === "funded" ? "FUNDED PRIVATE REWARD" : season.prizeStatus === "funding_pending" ? "REWARD PLEDGED" : "EXHIBITION"} / {joinable ? remainingLabel(season, now) : timeLabel(season.locksAt)}</small></span>
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

            {currentEntry ? (
              <div className="play-success" role="status">
                <span>ENTRY CONFIRMED</span>
                <h3>{currentEntry.displayName} is sealed.</h3>
                <p>Your agent is entered and its strategy is encrypted. Other players can see its name and results, but they cannot read its rules.</p>
                <dl>
                  <div><dt>AGENT</dt><dd>{currentEntry.agentId}</dd></div>
                  <div><dt>ENTRY PROOF</dt><dd><code>{shortCommitment(currentEntry.artifactCommitment)}</code></dd></div>
                  <div><dt>IF YOU WIN</dt><dd>PAID PRIVATELY</dd></div>
                </dl>
                <div className="play-success-actions">
                  <Link className="play-primary" href={`/?project=${encodeURIComponent(projectId)}#broadcast`}>[ WATCH YOUR AGENT ]</Link>
                  <Link className="play-secondary" href="/">[ BACK TO HOME ]</Link>
                </div>
              </div>
            ) : (
              <form className="play-form" onSubmit={enterArena}>
                <fieldset disabled={!selectedSeasonJoinable || submitting}>
                  <legend className="sr-only">Import a Veil Agent Protocol package</legend>

                  <section className="play-agent-guide" aria-labelledby="agent-guide-title">
                    <div>
                      <span>START HERE</span>
                      <h3 id="agent-guide-title">Copy the guide. Your coding agent handles the rest.</h3>
                      <p>AGENT.md explains the game inputs, package format, and validation rules. The coding agent should return one <code>.veil-agent.json</code> file.</p>
                    </div>
                    <div className="play-agent-guide-actions">
                      <button type="button" onClick={copyAgentGuide}>[{guideCopyState === "copied" ? " GUIDE LINK COPIED " : " COPY AGENT.MD LINK "}]</button>
                      <a href="/AGENT.md" download>[ DOWNLOAD GUIDE ]</a>
                    </div>
                    {guideCopyState === "error" && <p className="play-inline-error" role="alert">Copy was blocked. Download the guide instead.</p>}
                  </section>

                  <section className="play-package-import" aria-labelledby="package-import-title">
                    <div className="play-package-import-head">
                      <div><span>PRIVATE PACKAGE</span><h3 id="package-import-title">Import what your coding agent created</h3></div>
                      <label className="play-file-button">
                        <input type="file" accept="application/json,.json,.veil-agent.json" onChange={importAgentPackage} />
                        [ CHOOSE PACKAGE ]
                      </label>
                    </div>
                    <textarea
                      value={agentPackageText}
                      onChange={(event) => updateAgentPackage(event.target.value)}
                      placeholder="Paste the complete .veil-agent.json package here"
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
                    <h3 id="review-title">{packageReview.status === "ready" ? `${packageReview.agentPackage.displayName} / ${packageReview.agentPackage.agentId}` : "WAITING FOR A VALID AGENT PACKAGE"}</h3>
                  </div>
                  {packageReview.status === "ready" && (
                    <dl className="play-package-facts">
                      <div><dt>PROTOCOL</dt><dd>{packageReview.agentPackage.protocolVersion}</dd></div>
                      <div><dt>ENGINE</dt><dd>{packageReview.agentPackage.engineVersion}</dd></div>
                      <div><dt>RULES</dt><dd>{packageReview.agentPackage.policy.rules.length}</dd></div>
                      <div><dt>COMMITMENT</dt><dd><code>{shortCommitment(packageReview.commitment)}</code></dd></div>
                    </dl>
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

                {sessionState === "authenticated" ? (
                  <div className="play-wallet-state"><span>WALLET VERIFIED</span><strong>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</strong><small>This session can approve an arena entry. It cannot move funds.</small></div>
                ) : (
                  <div className="play-sign-in-callout">
                    <div><span>{sessionState === "checking" ? "CHECKING WALLET" : "SIGN IN TO ENTER"}</span><p>Your wallet approval links the agent and any reward to you.</p></div>
                    {sessionState !== "checking" && <Link href="/sign-in">[ SIGN IN WITH WALLET ]</Link>}
                  </div>
                )}

                {submitError && <p className="play-error" role="alert">{submitError}</p>}
                {entryState === "error" && <div className="play-error play-entry-error" role="alert"><span>Your existing entry could not be checked. Nothing new was submitted.</span><button type="button" onClick={() => { setEntryState("loading"); setEntryRefresh((current) => current + 1); }}>CHECK AGAIN</button></div>}

                <button
                  className="play-submit"
                  type="submit"
                  disabled={!selectedSeasonJoinable || sessionState !== "authenticated" || submitting || entryState !== "ready" || packageReview.status !== "ready"}
                >
                  <span>{submitting ? "SEALING APPROVED PACKAGE..." : !selectedSeasonJoinable && selectedSeason ? "THIS ARENA IS NOT ACCEPTING ENTRIES" : entryState !== "ready" && sessionState === "authenticated" && selectedSeason ? "CHECKING ENTRY..." : packageReview.status !== "ready" ? "IMPORT A VALID AGENT PACKAGE" : "APPROVE, SEAL AND ENTER"}</span>
                  <strong aria-hidden="true">↓</strong>
                </button>
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
