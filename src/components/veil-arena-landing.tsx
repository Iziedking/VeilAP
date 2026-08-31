"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VeilLogo } from "@/components/veil-logo";
import { apiFetch } from "@/lib/api/client";

type ArenaView = "arena" | "leaderboard";

type LeaderboardEntry = {
  agentId: string;
  artifactCommitment: string;
  displayName: string;
  losses: number;
  points: number;
  wins: number;
  matches: number;
  ties: number;
};

type PublicMatch = {
  matchId: string;
  engineVersion: string;
  players: Array<{
    agentId: string;
    displayName: string;
    artifactCommitment: string;
  }>;
  score: Record<string, number>;
  winner: string | "tie";
  seedCommitment: string;
  transcriptRoot: string;
  handCount: number | null;
  signedReceipt?: {
    publicKeyId: string;
    signature: string;
  };
  selectiveReveal?: {
    action: "fold" | "check" | "call" | "raise";
    agentId: string;
    handIndex: number;
    handNumber: number;
    position: "button" | "big_blind";
    transcriptRoot: string;
  };
  createdAt: string;
};

type PublicArena = { matches: PublicMatch[]; leaderboard: LeaderboardEntry[] };
type ApiEnvelope = { ok: true; value: PublicArena } | { ok: false; code: string };

type SettlementReceipt = {
  poolId: string;
  seasonId: string;
  winnerAgentId: string;
  fundingReceiptDigest: string;
  settlementReceiptDigest: string;
  settledAt: string;
};

type SettlementEnvelope = { ok: true; value: SettlementReceipt[] } | { ok: false; code: string };

function shortCommitment(value: string): string {
  return value.length > 16 ? value.slice(0, 8) + "..." + value.slice(-6) : value;
}

export function VeilArenaLanding({ defaultProjectId }: { defaultProjectId: string }) {
  const [view, setView] = useState<ArenaView>("arena");
  const [arena, setArena] = useState<PublicArena | null>(null);
  const [settlements, setSettlements] = useState<SettlementReceipt[]>([]);
  const projectId = defaultProjectId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const loadArena = async () => {
      setLoading(true);
      try {
        const projectPath = "/api/projects/" + encodeURIComponent(projectId);
        const [response, settlementResponse] = await Promise.all([
          apiFetch(projectPath + "/matches"),
          apiFetch(projectPath + "/settlement-receipts"),
        ]);
        const body = await response.json() as ApiEnvelope;
        const settlementBody = await settlementResponse.json() as SettlementEnvelope;
        if (!active) return;
        if (!response.ok || !body.ok) {
          setError(body.ok ? "The arena could not be loaded." : body.code);
          return;
        }
        setArena(body.value);
        setSettlements(settlementResponse.ok && settlementBody.ok ? settlementBody.value : []);
        setError("");
      } catch {
        if (active) setError("The arena could not be reached.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadArena();
    const interval = window.setInterval(() => void loadArena(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [projectId]);

  const latestMatch = arena?.matches[0];
  const latestSettlement = settlements[0];
  const latestPlayers = latestMatch?.players ?? [];
  const latestScore = latestMatch
    ? latestPlayers.map((player) => latestMatch.score[player.agentId] ?? 0).join(" : ")
    : "";

  return (
    <div className="arena-page">
      <header className="arena-nav">
        <div className="arena-nav-inner">
          <a className="arena-brand" href="#top" aria-label="Veil Arena home"><VeilLogo /></a>
          <div className="arena-nav-actions">
            <a className="arena-button arena-button-quiet" href="#broadcast">Watch the arena</a>
            <Link className="arena-button arena-button-signal" href="/play">Enter a competition</Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="arena-hero" aria-labelledby="arena-hero-title">
          <div className="arena-title-row">
            <span className="arena-hero-mark" aria-hidden="true"><VeilLogo /></span>
            <h1 id="arena-hero-title">Build an agent. Keep its strategy private.</h1>
          </div>

          <div className="arena-hero-meta" aria-label="Arena facts">
            <span>STARKNET</span>
            <span>OPEN COMPETITION</span>
            <span>{arena?.leaderboard.length ?? 0} SEALED AGENTS</span>
            <span>{arena?.matches.length ?? 0} COMPLETED MATCHES</span>
            <span>{settlements.length} PRIVATE PAYOUTS</span>
            <span>{loading ? "SYNCING RECEIPTS" : projectId ? "LIVE RECEIPTS" : "PROJECT NOT SELECTED"}</span>
          </div>

          <p className="arena-hero-lede">
            Give AGENT.md to a coding agent and it will build your poker package. You approve the entry. Veil Arena publishes the match result while keeping the strategy and payout details private.
          </p>

          <article className="arena-latest" aria-label="Latest public match receipt">
            <header>
              <span><i className="arena-live-dot" /> LATEST ARENA DECISION</span>
              <span>{latestMatch?.matchId ?? "NO MATCH"}</span>
              <span>{latestMatch?.signedReceipt ? "SIGNED RECEIPT" : projectId ? "PERSISTED DATA" : "AWAITING PROJECT"}</span>
            </header>
            <div className="arena-latest-body">
              {latestMatch ? (
                <>
                  <div className="arena-latest-result">
                    <strong>{latestPlayers.map((player) => player.displayName.toUpperCase()).join(" / ")}</strong>
                    <span>SCORE {latestScore}</span>
                    <small>POLICIES SEALED</small>
                  </div>
                  <p>Each match uses duplicate deals and reversed seats. The receipt records the result while both policies stay sealed. {latestMatch.selectiveReveal ? "One losing action is available for audit." : "No action has been revealed."}</p>
                    <small className="arena-latest-receipt">TRANSCRIPT ROOT {shortCommitment(latestMatch.transcriptRoot)} / {latestMatch.signedReceipt ? "SIGNED" : "LEGACY RECEIPT"}</small>
                </>
              ) : (
                <div className="arena-empty-state">
                  <strong>{error || (projectId ? "NO COMPLETED MATCHES" : "ARENA PROJECT NOT CONFIGURED")}</strong>
                  <p>A receipt appears here after the first match finishes.</p>
                </div>
              )}
            </div>
          </article>

          <div className="arena-hero-actions">
            <Link className="arena-button arena-button-signal" href="/play">Enter a competition</Link>
            <a className="arena-button arena-button-quiet" href="#broadcast">View match results</a>
          </div>
        </section>

        <section className="arena-broadcast" id="broadcast" aria-labelledby="broadcast-title">
          <header className="arena-section-head">
            <div>
              <span>02 / LIVE COMPETITION</span>
              <h2 id="broadcast-title">PUBLIC ARENA</h2>
            </div>
            <strong><i className="arena-live-dot" /> {arena?.matches.length ?? 0} MATCH RECEIPTS</strong>
          </header>

          <div className="arena-console">
            <div className="arena-console-top">
              <div className="arena-view-switch" role="group" aria-label="Broadcast view">
                <button type="button" className={view === "arena" ? "active" : ""} aria-pressed={view === "arena"} onClick={() => setView("arena")}>[ ARENA ]</button>
                <button type="button" className={view === "leaderboard" ? "active" : ""} aria-pressed={view === "leaderboard"} onClick={() => setView("leaderboard")}>[ LEADERBOARD ]</button>
              </div>
              <div className="arena-console-facts">
                <span>{arena?.matches.length ?? 0} MATCHES PERSISTED</span>
                <span>ENGINE {latestMatch?.engineVersion ?? "WAITING"}</span>
                <span>POLICIES / SEALED</span>
              </div>
            </div>

            {view === "arena" ? (
              <div className="arena-match-grid">
                {arena?.matches.length ? arena.matches.map((match) => (
                  <article className="arena-match-card is-settled" key={match.matchId}>
                    <header><span>{match.matchId}</span><strong>SETTLED</strong></header>
                    <div className="arena-match-versus">
                      <div><strong>{match.players[0]?.displayName.toUpperCase()}</strong><b>{match.score[match.players[0]?.agentId ?? ""] ?? 0}</b></div>
                      <span>VS</span>
                      <div><strong>{match.players[1]?.displayName.toUpperCase()}</strong><b>{match.score[match.players[1]?.agentId ?? ""] ?? 0}</b></div>
                    </div>
                    <div className="arena-match-progress is-complete"><i /></div>
                    <footer><span>{match.signedReceipt ? "RECEIPT SIGNED" : "RECEIPT COMMITTED"}</span><strong>SEATS SWAPPED</strong></footer>
                  </article>
                )) : (
                  <div className="arena-empty-state">
                    <strong>{projectId ? "NO RECEIPTS YET" : "ARENA PROJECT NOT CONFIGURED"}</strong>
                    <p>Matches appear here after at least two agents enter and the operator starts the draw.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="arena-leaderboard" role="table" aria-label="Public leaderboard">
                <div className="arena-leader-row arena-leader-head" role="row">
                  <span role="columnheader">Rank</span><span role="columnheader">Agent</span><span role="columnheader">Record</span><span role="columnheader">Points</span><span role="columnheader">Artifact</span>
                </div>
                {arena?.leaderboard.map((agent, index) => (
                  <div className={"arena-leader-row " + (index === 0 ? "is-first" : "")} role="row" key={agent.agentId}>
                    <span role="cell">{String(index + 1).padStart(2, "0")}</span>
                    <span role="cell"><strong>{agent.displayName.toUpperCase()}</strong><small>{agent.agentId}</small></span>
                    <span role="cell">{agent.wins} / {agent.losses} / {agent.ties}</span>
                    <span role="cell"><b>{agent.points}</b></span>
                    <span role="cell"><code>{shortCommitment(agent.artifactCommitment)}</code><small>SEALED</small></span>
                  </div>
                ))}
                {!arena?.leaderboard.length && <div className="arena-empty-state"><strong>NO AGENTS REGISTERED</strong><p>The leaderboard starts when agents enter an open competition. A reward is optional.</p></div>}
              </div>
            )}

            <div className="arena-live-line" aria-live="polite">
              <span>NOW</span>
              <strong>{latestMatch ? latestMatch.matchId + " / RECEIPT VERIFIED" : "WAITING FOR A PERSISTED RECEIPT"}</strong>
              <small>STRATEGY FIELDS SEALED</small>
            </div>
          </div>
        </section>

        <section className="arena-proof" id="proof" aria-labelledby="proof-title">
          <header className="arena-section-head">
            <div>
              <span>03 / SELECTIVE REVEAL</span>
              <h2 id="proof-title">MATCH RECEIPT</h2>
            </div>
            <strong>{latestMatch ? latestMatch.matchId + " / VERIFIED" : "NO RECEIPT"}</strong>
          </header>

          <div className="arena-proof-grid">
            <article>
              <span>WINNER</span>
              <strong>POLICY SEALED</strong>
              <p>{latestMatch ? "The receipt names the winner without publishing its strategy." : "The winner will appear after the first match finishes."}</p>
              <i className="arena-redaction" aria-hidden="true" />
            </article>
            <article className="is-signal">
              <span>PUBLIC PROOF</span>
              <strong>TRANSCRIPT ROOT</strong>
              <p>{latestMatch ? shortCommitment(latestMatch.transcriptRoot) : "NOT AVAILABLE"}</p>
              <code>{latestMatch ? "SEED " + shortCommitment(latestMatch.seedCommitment) + " / " + (latestMatch.signedReceipt ? "SIGNED " + latestMatch.signedReceipt.publicKeyId : "LEGACY") : "NO SEALED RUN"}</code>
            </article>
            <article>
              <span>LOSING MOVE</span>
              <strong>{latestMatch?.selectiveReveal ? latestMatch.selectiveReveal.action.toUpperCase() : "SEALED"}</strong>
              <p>{latestMatch?.selectiveReveal ? "One losing action is available for audit." : "An authorized reviewer can reveal one losing action without opening either strategy."}</p>
              <small>{latestMatch?.selectiveReveal ? "LEAF " + String(latestMatch.selectiveReveal.handIndex).padStart(2, "0") + " / PROOF ATTACHED" : "WINNER STRATEGY STAYS SEALED"}</small>
            </article>
          </div>
        </section>

        <section className="arena-boundary" id="privacy" aria-label="Privacy boundary">
          <div><span>PUBLIC</span><strong>SCORE / RANK / RECEIPT</strong></div>
          <div><span>SEALED</span><strong>POLICY / REASONING</strong></div>
          <div><span>RUNNER</span><strong>TRUSTED V1 OPERATOR</strong></div>
          <div><span>REWARD</span><strong>PRIVATE / SPONSOR AUTHORIZED</strong></div>
        </section>

        <section className="arena-settlement" id="settlements" aria-labelledby="settlement-title">
          <header className="arena-section-head">
            <div>
              <span>04 / PRIVATE REWARD</span>
              <h2 id="settlement-title">REWARD PROOF</h2>
            </div>
            <strong>{latestSettlement ? "PAYOUT AUTHORIZED" : "NO SETTLEMENT"}</strong>
          </header>
          {latestSettlement ? (
            <article className="arena-settlement-card">
              <div className="arena-settlement-main">
                <span>WINNER PAYOUT</span>
                <strong>PRIVATE TRANSFER RECORDED</strong>
                <small>AGENT {shortCommitment(latestSettlement.winnerAgentId)} / SEASON {latestSettlement.seasonId}</small>
              </div>
              <div className="arena-settlement-proof">
                <span>PUBLIC COMMITMENTS</span>
                <code>FUND {shortCommitment(latestSettlement.fundingReceiptDigest)}</code>
                <code>SETTLE {shortCommitment(latestSettlement.settlementReceiptDigest)}</code>
                <small>RECIPIENT STAYS PRIVATE</small>
              </div>
            </article>
          ) : (
            <div className="arena-empty-state arena-settlement-empty">
              <strong>{projectId ? "NO REWARDS SETTLED YET" : "ARENA PROJECT NOT CONFIGURED"}</strong>
              <p>After a sponsored season pays out, the public receipt confirms settlement. The amount and recipient remain private.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="arena-footer">
        <VeilLogo />
        <span>SEALED AGENT COMPETITION / STARKNET</span>
        <Link href="/arena-console">Host a competition</Link>
      </footer>
    </div>
  );
}
