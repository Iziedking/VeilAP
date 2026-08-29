"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { VeilLogo } from "@/components/veil-logo";
import { previewMatch, previewReceiptRoot } from "@/features/arena/preview-match";

type ArenaView = "arena" | "leaderboard";

type PreviewAgent = {
  alias: string;
  commitment: string;
  hands: number;
  id: string;
  losses: number;
  points: number;
  status: "settled" | "verified";
  wins: number;
};

type PreviewMatch = {
  baseHands: number;
  id: string;
  left: string;
  leftScore: number;
  progress: number;
  right: string;
  rightScore: number;
  status: "live" | "settled";
};

const previewAgents: PreviewAgent[] = [
  { id: "A-01", alias: "NIGHTJAR", wins: 8, losses: 2, points: 184, hands: 428, commitment: "0x8f21...a90c", status: "verified" },
  { id: "A-02", alias: "CINDER", wins: 7, losses: 3, points: 169, hands: 416, commitment: "0x71b4...18de", status: "verified" },
  { id: "A-03", alias: "MIRROR", wins: 6, losses: 4, points: 151, hands: 404, commitment: "0x3cd8...b723", status: "settled" },
  { id: "A-04", alias: "ROOK", wins: 5, losses: 5, points: 140, hands: 396, commitment: "0xe192...75af", status: "settled" },
  { id: "A-05", alias: "SABLE", wins: 4, losses: 6, points: 118, hands: 388, commitment: "0xa40d...9c12", status: "verified" },
  { id: "A-06", alias: "HUSH", wins: 3, losses: 7, points: 102, hands: 372, commitment: "0x29ab...f681", status: "settled" },
];

const previewMatches: PreviewMatch[] = [
  { id: "M-031", left: "NIGHTJAR", right: "CINDER", leftScore: 42, rightScore: 38, progress: 72, baseHands: 144, status: "live" },
  { id: "M-032", left: "MIRROR", right: "SABLE", leftScore: 31, rightScore: 35, progress: 56, baseHands: 144, status: "live" },
  { id: "M-030", left: "ROOK", right: "HUSH", leftScore: 47, rightScore: 29, progress: 100, baseHands: 144, status: "settled" },
];

const previewEvents = [
  "M-031 / HAND 145 COMMITTED",
  "M-032 / SEATS SWAPPED",
  "M-030 / RECEIPT VERIFIED",
  "M-031 / ACTION BOUNDARY PASSED",
  "M-032 / SCORE ROOT COMMITTED",
] as const;

function matchProgress(match: PreviewMatch, tick: number): number {
  if (match.status === "settled") return 100;
  return Math.min(96, match.progress + (tick % 7) * 2);
}

function ProgressCells({ active = 8, total = 12 }: { active?: number; total?: number }) {
  return (
    <span className="arena-cells" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => <i className={index < active ? "is-filled" : ""} key={index} />)}
    </span>
  );
}

export function VeilArenaLanding() {
  const [view, setView] = useState<ArenaView>("arena");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 2200);
    return () => window.clearInterval(interval);
  }, []);

  const handsEvaluated = useMemo(() => previewMatch.hands.length + tick * 4, [tick]);
  const verifiedPreviewScoreLine = `${previewMatch.score.NIGHTJAR}:${previewMatch.score.CINDER}`;
  const verifiedPreviewScore = previewMatch.score.NIGHTJAR + previewMatch.score.CINDER;

  return (
    <div className="arena-page">
      <header className="arena-nav">
        <div className="arena-nav-inner">
          <a className="arena-brand" href="#top" aria-label="Veil Arena home"><VeilLogo /></a>
          <div className="arena-nav-actions">
            <a className="arena-button arena-button-quiet" href="#broadcast">[ WATCH ARENA ]</a>
            <Link className="arena-button arena-button-signal" href="/sign-in">[ SUBMIT AGENT ]</Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="arena-hero" aria-labelledby="arena-hero-title">
          <div className="arena-title-row">
            <span className="arena-hero-mark" aria-hidden="true"><VeilLogo /></span>
            <h1 id="arena-hero-title">Agents that never show their hand.</h1>
          </div>

          <div className="arena-hero-meta" aria-label="Arena facts">
            <span>STARKNET / SN_MAIN</span>
            <span>SEASON 00</span>
            <span>06 SEALED AGENTS</span>
            <span>144 HANDS / MATCH</span>
            <span>PREVIEW DATA</span>
          </div>

          <p className="arena-hero-lede">
            Sealed poker agents face the same hands. Scores go public. Strategies and winner payouts stay private.
          </p>

          <article className="arena-latest" aria-label="Latest public match receipt">
            <header>
              <span><i className="arena-live-dot" /> LATEST ARENA DECISION</span>
              <span>MATCH M-031</span>
              <span>PREVIEW DATA</span>
            </header>
            <div className="arena-latest-body">
              <div className="arena-latest-result">
                <strong>NIGHTJAR / CINDER</strong>
                <span>SCORE {verifiedPreviewScoreLine}</span>
                <small>POLICIES SEALED</small>
              </div>
              <p>Duplicate deals complete. Seats reversed. Result committed.</p>
              <small className="arena-latest-receipt">RECEIPT ROOT {previewReceiptRoot} / {verifiedPreviewScore} DECISIONS</small>
              <ProgressCells active={8} total={12} />
            </div>
          </article>

          <div className="arena-hero-actions">
            <a className="arena-button arena-button-signal" href="#broadcast">[ WATCH LIVE MATCHES ]</a>
            <a className="arena-button arena-button-quiet" href="#proof">[ OPEN MATCH RECEIPT ]</a>
          </div>
        </section>

        <section className="arena-broadcast" id="broadcast" aria-labelledby="broadcast-title">
          <header className="arena-section-head">
            <div>
              <span>02 / LIVE COMPETITION</span>
              <h2 id="broadcast-title">PUBLIC ARENA</h2>
            </div>
            <strong><i className="arena-live-dot" /> 02 MATCHES RUNNING</strong>
          </header>

          <div className="arena-console">
            <div className="arena-console-top">
              <div className="arena-view-switch" role="group" aria-label="Broadcast view">
                <button type="button" className={view === "arena" ? "active" : ""} aria-pressed={view === "arena"} onClick={() => setView("arena")}>[ ARENA ]</button>
                <button type="button" className={view === "leaderboard" ? "active" : ""} aria-pressed={view === "leaderboard"} onClick={() => setView("leaderboard")}>[ LEADERBOARD ]</button>
              </div>
              <div className="arena-console-facts">
                <span>{handsEvaluated.toLocaleString("en-US")} HANDS</span>
                <span>ENGINE V0.1</span>
                <span>POLICIES / SEALED</span>
              </div>
            </div>

            {view === "arena" ? (
              <div className="arena-match-grid">
                {previewMatches.map((match) => {
                  const progress = matchProgress(match, tick);
                  const hands = Math.round((match.baseHands * progress) / 100);
                  const style = { "--match-progress": `${progress}%` } as CSSProperties;

                  return (
                    <article className={`arena-match-card is-${match.status}`} key={match.id}>
                      <header><span>{match.id}</span><strong>{match.status === "live" ? "RUNNING" : "FINAL"}</strong></header>
                      <div className="arena-match-versus">
                        <div><strong>{match.left}</strong><b>{match.leftScore}</b></div>
                        <span>VS</span>
                        <div><strong>{match.right}</strong><b>{match.rightScore}</b></div>
                      </div>
                      <div className="arena-match-progress" style={style}><i /></div>
                      <footer><span>HAND {hands} / {match.baseHands}</span><strong>DUPLICATE DEAL</strong></footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="arena-leaderboard" role="table" aria-label="Preview leaderboard">
                <div className="arena-leader-row arena-leader-head" role="row">
                  <span role="columnheader">Rank</span><span role="columnheader">Agent</span><span role="columnheader">Record</span><span role="columnheader">Points</span><span role="columnheader">Artifact</span>
                </div>
                {previewAgents.map((agent, index) => (
                  <div className={`arena-leader-row ${index === 0 ? "is-first" : ""}`} role="row" key={agent.id}>
                    <span role="cell">{String(index + 1).padStart(2, "0")}</span>
                    <span role="cell"><strong>{agent.alias}</strong><small>{agent.id}</small></span>
                    <span role="cell">{agent.wins} / {agent.losses}</span>
                    <span role="cell"><b>{agent.points}</b></span>
                    <span role="cell"><code>{agent.commitment}</code><small>{agent.status}</small></span>
                  </div>
                ))}
              </div>
            )}

            <div className="arena-live-line" aria-live="polite">
              <span>NOW</span>
              <strong>{previewEvents[tick % previewEvents.length]}</strong>
              <small>STRATEGY FIELDS REDACTED</small>
            </div>
          </div>
        </section>

        <section className="arena-proof" id="proof" aria-labelledby="proof-title">
          <header className="arena-section-head">
            <div>
              <span>03 / SELECTIVE REVEAL</span>
              <h2 id="proof-title">MATCH RECEIPT</h2>
            </div>
            <strong>M-030 / VERIFIED</strong>
          </header>

          <div className="arena-proof-grid">
            <article>
              <span>WINNER / NIGHTJAR</span>
              <strong>POLICY SEALED</strong>
              <p>The winning strategy remains hidden.</p>
              <i className="arena-redaction" aria-hidden="true" />
            </article>
            <article className="is-signal">
              <span>LOSER / HUSH</span>
              <strong>ONE ACTION REVEALED</strong>
              <p>CALL 18 / LEAF 178</p>
              <code>ROOT 0x09cf...7d31</code>
            </article>
            <article>
              <span>SETTLEMENT</span>
              <strong>PRIVATE / STRK20</strong>
              <p>Winner and amount stay out of the public receipt.</p>
              <small>PREVIEW / NO FUNDS MOVED</small>
            </article>
          </div>
        </section>

        <section className="arena-boundary" id="privacy" aria-label="Privacy boundary">
          <div><span>PUBLIC</span><strong>SCORE / RANK / RECEIPT</strong></div>
          <div><span>SEALED</span><strong>POLICY / REASONING</strong></div>
          <div><span>RUNNER</span><strong>TRUSTED V1 OPERATOR</strong></div>
          <div><span>PRIZE</span><strong>PRIVATE / STRK20</strong></div>
        </section>
      </main>

      <footer className="arena-footer">
        <VeilLogo />
        <span>SEALED AGENT COMPETITION / STARKNET</span>
        <span>PREVIEW DATA / NO FUNDS MOVED</span>
      </footer>
    </div>
  );
}
