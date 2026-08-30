"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";
import { apiFetch } from "@/lib/api/client";

type SeasonStatus = "open" | "locked" | "completed" | "cancelled";
type PrizeStatus = "funding_pending" | "funded" | "settlement_pending" | "settled" | "unknown";
type OpeningRange = "tight" | "balanced" | "wide";
type PlayAction = "fold" | "call" | "raise";

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

const rangeThreshold: Record<OpeningRange, number> = {
  tight: 22,
  balanced: 18,
  wide: 14,
};

function isJoinable(season: ArenaSeason, now: number): boolean {
  return season.status === "open"
    && season.entryMode === "open"
    && season.prizeStatus === "funded"
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
  if (season.prizeStatus !== "funded") return "REWARD NOT FUNDED";
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

function handleFrom(name: string, walletAddress: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 22);
  const walletSuffix = walletAddress.replace(/^0x/i, "").slice(-5).toUpperCase();
  const candidate = [base || "AGENT", walletSuffix].filter(Boolean).join("_");
  return candidate.slice(0, 32);
}

function enrollmentMessage(code: string): string {
  const messages: Record<string, string> = {
    ARENA_PRIZE_POOL_NOT_FUNDED: "Entry is paused until the real reward pool is funded.",
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
    INVALID_INPUT: "Review the agent name and strategy choices, then try again.",
  };
  return messages[code] ?? "The agent could not be entered. Nothing was submitted. Try again.";
}

function FieldChoice({
  checked,
  description,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label className={`play-choice${checked ? " is-selected" : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span aria-hidden="true" />
      <strong>{label}</strong>
      <small>{description}</small>
    </label>
  );
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
  const [displayName, setDisplayName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [openingRange, setOpeningRange] = useState<OpeningRange>("balanced");
  const [strongAction, setStrongAction] = useState<Exclude<PlayAction, "fold">>("raise");
  const [defaultAction, setDefaultAction] = useState<Exclude<PlayAction, "raise">>("call");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [entryRefresh, setEntryRefresh] = useState(0);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

  function updateDisplayName(value: string) {
    setDisplayName(value);
    if (!handleEdited) setAgentId(handleFrom(value, walletAddress));
    resetSubmission();
  }

  function updateAgentId(value: string) {
    setHandleEdited(true);
    setAgentId(value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32));
    resetSubmission();
  }

  async function enterArena(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSeason || !selectedSeasonJoinable || sessionState !== "authenticated") return;
    const normalizedName = displayName.trim();
    if (!normalizedName || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(agentId)) {
      setSubmitError("Add an agent name and a unique handle with at least three characters.");
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
            agentId,
            policy: {
              schemaVersion: 1,
              displayName: normalizedName,
              rules: [
                { minHoleRankTotal: rangeThreshold[openingRange], action: strongAction },
                { maxToCallMinor: 10, action: defaultAction },
              ],
              fallbackAction: defaultAction,
            },
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
              ? "No funded public season is accepting agents right now."
              : "Choose a funded season and build your agent. No code is required.";
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
          <span className="play-kicker">NO CODE NEEDED / PRIVATE STRATEGY</span>
          <h1 id="play-title">Build your agent. Keep its playbook private. Win rewards.</h1>
          <p>Answer three simple poker questions. Veil Arena turns your choices into a deterministic agent, runs every agent under the same fixed rules, and publishes results without publishing anyone&apos;s strategy.</p>
          <ol className="play-steps" aria-label="How to enter">
            <li><span>01</span><strong>Choose an open arena with a verified reward plan</strong></li>
            <li><span>02</span><strong>Answer three questions to build your agent</strong></li>
            <li><span>03</span><strong>Sign in, seal the strategy, and enter</strong></li>
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
                    <span><strong>{seasonStateLabel(season, now)}</strong><small>{season.prizeStatus === "funded" ? "PRIVATE REWARD READY" : "REWARD NOT READY"} / {joinable ? remainingLabel(season, now) : timeLabel(season.locksAt)}</small></span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="play-builder" aria-labelledby="builder-title">
            <header>
              <div><span>02 / AGENT BUILDER</span><h2 id="builder-title">Choose how your agent plays</h2></div>
              <strong>{selectedSeasonJoinable ? "OPEN FOR ENTRY" : selectedSeason ? "VIEW ONLY" : "WAITING FOR SEASON"}</strong>
            </header>

            {currentEntry ? (
              <div className="play-success" role="status">
                <span>ENTRY CONFIRMED</span>
                <h3>{currentEntry.displayName} is sealed.</h3>
                <p>Your strategy is encrypted and your agent is in the arena. Rivals can see the public handle and results, but not the rules that drive its decisions.</p>
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
                  <legend className="sr-only">Build a deterministic poker agent</legend>

                  <div className="play-identity-grid">
                    <label>
                      <span>AGENT NAME</span>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(event) => updateDisplayName(event.target.value)}
                        placeholder="Nightjar"
                        minLength={1}
                        maxLength={80}
                        autoComplete="off"
                        required
                      />
                      <small>This is the public name on match results.</small>
                    </label>
                    <label>
                      <span>UNIQUE HANDLE</span>
                      <input
                        type="text"
                        value={agentId}
                        onChange={(event) => updateAgentId(event.target.value)}
                        placeholder="NIGHTJAR_01"
                        minLength={3}
                        maxLength={32}
                        pattern="[A-Z0-9][A-Z0-9_-]{2,31}"
                        autoComplete="off"
                        required
                      />
                      <small>Letters, numbers, underscores, and hyphens.</small>
                    </label>
                  </div>

                  <div className="play-question">
                    <div><span>01</span><h3>Which hands should your agent contest?</h3></div>
                    <div className="play-choices play-choices-three">
                      <FieldChoice name="range" value="tight" label="Tight" description="Wait for premium starting cards." checked={openingRange === "tight"} onChange={() => { setOpeningRange("tight"); resetSubmission(); }} />
                      <FieldChoice name="range" value="balanced" label="Balanced" description="Contest a measured range of cards." checked={openingRange === "balanced"} onChange={() => { setOpeningRange("balanced"); resetSubmission(); }} />
                      <FieldChoice name="range" value="wide" label="Wide" description="Apply pressure with more starting cards." checked={openingRange === "wide"} onChange={() => { setOpeningRange("wide"); resetSubmission(); }} />
                    </div>
                  </div>

                  <div className="play-question">
                    <div><span>02</span><h3>What should it do with a strong hand?</h3></div>
                    <div className="play-choices">
                      <FieldChoice name="strong-action" value="raise" label="Raise" description="Push the action when its cards qualify." checked={strongAction === "raise"} onChange={() => { setStrongAction("raise"); resetSubmission(); }} />
                      <FieldChoice name="strong-action" value="call" label="Call" description="Stay controlled even with strong cards." checked={strongAction === "call"} onChange={() => { setStrongAction("call"); resetSubmission(); }} />
                    </div>
                  </div>

                  <div className="play-question">
                    <div><span>03</span><h3>What should it do otherwise?</h3></div>
                    <div className="play-choices">
                      <FieldChoice name="default-action" value="call" label="Call" description="Stay in the hand at the fixed table cost." checked={defaultAction === "call"} onChange={() => { setDefaultAction("call"); resetSubmission(); }} />
                      <FieldChoice name="default-action" value="fold" label="Fold" description="Protect the score and wait for strength." checked={defaultAction === "fold"} onChange={() => { setDefaultAction("fold"); resetSubmission(); }} />
                    </div>
                  </div>
                </fieldset>

                <section className="play-review" aria-labelledby="review-title">
                  <div><span>STRATEGY SUMMARY</span><h3 id="review-title">{openingRange.toUpperCase()} RANGE / {strongAction.toUpperCase()} STRONG / {defaultAction.toUpperCase()} OTHERWISE</h3></div>
                  <div className="play-privacy-grid">
                    <p><span>EVERYONE CAN SEE</span> Agent name, entry proof, match score, and rank.</p>
                    <p><span>KEPT PRIVATE</span> Exact strategy rules and the wallet that receives a win.</p>
                  </div>
                  <details>
                    <summary>How privacy works</summary>
                    <p>Your strategy reaches Veil Arena over HTTPS and is encrypted before storage with a project key protected by AWS KMS. The trusted match runner decrypts it only to execute fixed game rules. Veil Arena does not claim zero-knowledge execution.</p>
                  </details>
                </section>

                {sessionState === "authenticated" ? (
                  <div className="play-wallet-state"><span>WALLET SESSION VERIFIED</span><strong>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</strong><small>Sign-in proves control. It does not authorize a transfer.</small></div>
                ) : (
                  <div className="play-sign-in-callout">
                    <div><span>{sessionState === "checking" ? "CHECKING WALLET SESSION" : "WALLET SIGN-IN REQUIRED"}</span><p>A signed session binds one agent and any winning reward to your wallet.</p></div>
                    {sessionState !== "checking" && <Link href="/sign-in">[ SIGN IN SECURELY ]</Link>}
                  </div>
                )}

                {submitError && <p className="play-error" role="alert">{submitError}</p>}
                {entryState === "error" && <div className="play-error play-entry-error" role="alert"><span>Your existing entry could not be checked. Nothing new was submitted.</span><button type="button" onClick={() => { setEntryState("loading"); setEntryRefresh((current) => current + 1); }}>CHECK AGAIN</button></div>}

                <button
                  className="play-submit"
                  type="submit"
                  disabled={!selectedSeasonJoinable || sessionState !== "authenticated" || submitting || entryState !== "ready"}
                >
                  <span>{submitting ? "SEALING AGENT..." : !selectedSeasonJoinable && selectedSeason ? "THIS ARENA IS NOT ACCEPTING ENTRIES" : entryState !== "ready" && sessionState === "authenticated" && selectedSeason ? "CHECKING ENTRY..." : "SEAL AGENT AND ENTER"}</span>
                  <strong aria-hidden="true">↓</strong>
                </button>
              </form>
            )}
          </section>
        </div>
      </main>

      <footer className="play-footer">
        <VeilLogo />
        <span>FIXED RULES / SEALED STRATEGIES</span>
        <span>REAL SEASONS / REAL REWARD STATUS</span>
      </footer>
    </div>
  );
}
