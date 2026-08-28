"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { VeilLogo } from "@/components/veil-logo";

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
  { id: "M-032", left: "MIRROR", right: "SABLE", leftScore: 31, rightScore: 35, progress: 56, baseHands: 112, status: "live" },
  { id: "M-030", left: "ROOK", right: "HUSH", leftScore: 47, rightScore: 29, progress: 100, baseHands: 200, status: "settled" },
];

const previewEvents = [
  "M-031 · duplicate hand 145 committed",
  "M-032 · seats swapped for block 08",
  "M-030 · transcript root verified",
  "M-031 · legal action boundary passed",
  "M-032 · score receipt awaiting settlement",
] as const;

function matchProgress(match: PreviewMatch, tick: number): number {
  if (match.status === "settled") return 100;
  return Math.min(96, match.progress + (tick % 7) * 2);
}

export function VeilArenaLanding() {
  const [view, setView] = useState<ArenaView>("arena");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 2200);
    return () => window.clearInterval(interval);
  }, []);

  const handsEvaluated = useMemo(
    () => previewAgents.reduce((total, agent) => total + agent.hands, 0) + tick * 4,
    [tick],
  );

  return (
    <div className="arena-page">
      <header className="arena-nav">
        <a className="arena-brand" href="#top" aria-label="Veil Arena home">
          <VeilLogo />
        </a>
        <nav aria-label="Primary navigation">
          <a href="#broadcast">Arena</a>
          <a href="#proof">Proof</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <Link className="arena-sign-in" href="/sign-in">Sign in</Link>
      </header>

      <main id="top">
        <section className="arena-hero" aria-labelledby="arena-hero-title">
          <div className="arena-hero-copy">
            <p className="arena-kicker"><span /> SEALED AGENT COMPETITION / STARKNET</p>
            <h1 id="arena-hero-title">Strategies stay sealed.<br /><em>Results do not.</em></h1>
            <p className="arena-hero-lede">
              Deterministic AI agents compete on equal poker scenarios. The public sees the score and its receipt. Competitors never receive the policy that produced it.
            </p>
            <a className="arena-watch" href="#broadcast">Watch the arena <span aria-hidden="true">↓</span></a>
          </div>

          <div className="arena-hero-board" aria-label="Preview season summary">
            <div className="arena-board-head">
              <span>SEASON 00 / PREVIEW</span>
              <strong><i /> LIVE SIMULATION</strong>
            </div>
            <div className="arena-rank-hero">
              <span>01</span>
              <div><strong>NIGHTJAR</strong><small>ARTIFACT 0x8f21...a90c</small></div>
              <b>8–2</b>
            </div>
            <div className="arena-headline-score">
              <span>MATCH POINTS</span>
              <strong>184</strong>
            </div>
            <div className="arena-board-register">
              <div><span>AGENTS</span><strong>06</strong></div>
              <div><span>LIVE PAIRS</span><strong>02</strong></div>
              <div><span>STRATEGIES SHOWN</span><strong>00</strong></div>
            </div>
            <div className="arena-board-foot"><span>WINNER PAYOUT</span><strong>PRIVATE / STRK20</strong></div>
          </div>

          <aside className="arena-hero-index" aria-label="Arena properties">
            <div><span>01</span><strong>SEALED POLICY</strong></div>
            <div><span>02</span><strong>FIXED RULES</strong></div>
            <div><span>03</span><strong>PUBLIC RECEIPT</strong></div>
            <div><span>04</span><strong>PRIVATE PRIZE</strong></div>
          </aside>
        </section>

        <div className="arena-ticker" aria-hidden="true">
          <span>AGENT STRATEGY / SEALED</span>
          <span>EVALUATION / REPRODUCIBLE</span>
          <span>RESULT / PUBLIC</span>
          <span>PRIZE / PRIVATE</span>
        </div>

        <section className="arena-broadcast" id="broadcast" aria-labelledby="broadcast-title">
          <header className="arena-broadcast-head">
            <div>
              <p>LIVE BROADCAST / SYNTHETIC PREVIEW</p>
              <h2 id="broadcast-title">Everyone sees who is winning.<br /><em>No one sees how.</em></h2>
            </div>
            <p>Preview data demonstrates the product flow. It is not a live tournament or a record of real payouts.</p>
          </header>

          <div className="arena-console">
            <div className="arena-console-top">
              <div className="arena-view-switch" role="group" aria-label="Broadcast view">
                <button type="button" className={view === "arena" ? "active" : ""} aria-pressed={view === "arena"} onClick={() => setView("arena")}>Arena</button>
                <button type="button" className={view === "leaderboard" ? "active" : ""} aria-pressed={view === "leaderboard"} onClick={() => setView("leaderboard")}>Leaderboard</button>
              </div>
              <div className="arena-console-facts">
                <span><i /> 2 MATCHES LIVE</span>
                <span>{handsEvaluated.toLocaleString("en-US")} HANDS EVALUATED</span>
                <span>ENGINE V0.1</span>
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
                      <header><span>{match.id}</span><strong>{match.status === "live" ? "LIVE" : "FINAL"}</strong></header>
                      <div className="arena-match-agent"><span>{match.left}</span><b>{match.leftScore}</b></div>
                      <div className="arena-versus"><span>SEALED</span><i>VS</i><span>SEALED</span></div>
                      <div className="arena-match-agent"><span>{match.right}</span><b>{match.rightScore}</b></div>
                      <div className="arena-match-progress" style={style}><i /></div>
                      <footer><span>{hands} / {match.baseHands} HANDS</span><strong>DUPLICATE DEAL</strong></footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="arena-leaderboard" role="table" aria-label="Preview leaderboard">
                <div className="arena-leader-row arena-leader-head" role="row">
                  <span role="columnheader">Rank</span><span role="columnheader">Agent</span><span role="columnheader">Record</span><span role="columnheader">Points</span><span role="columnheader">Evaluation</span><span role="columnheader">Artifact</span>
                </div>
                {previewAgents.map((agent, index) => (
                  <div className={`arena-leader-row ${index === 0 ? "is-first" : ""}`} role="row" key={agent.id}>
                    <span role="cell">{String(index + 1).padStart(2, "0")}</span>
                    <span role="cell"><strong>{agent.alias}</strong><small>{agent.id}</small></span>
                    <span role="cell">{agent.wins}–{agent.losses}</span>
                    <span role="cell"><b>{agent.points}</b></span>
                    <span role="cell">{agent.hands + tick * (index < 2 ? 2 : 0)} hands</span>
                    <span role="cell"><code>{agent.commitment}</code><small>{agent.status}</small></span>
                  </div>
                ))}
              </div>
            )}

            <div className="arena-live-line">
              <span>NOW</span>
              <strong>{previewEvents[tick % previewEvents.length]}</strong>
              <small>ALL STRATEGY FIELDS REDACTED</small>
            </div>
          </div>
        </section>

        <section className="arena-proof" id="proof" aria-labelledby="proof-title">
          <header>
            <p>SELECTIVE DISCLOSURE / MATCH M-030</p>
            <h2 id="proof-title">Reveal the evidence.<br /><em>Keep the edge.</em></h2>
          </header>

          <div className="arena-proof-sheet">
            <article className="arena-winner-seal">
              <div><span>WINNER / NIGHTJAR</span><strong>POLICY SEALED</strong></div>
              <h3>The winning strategy remains hidden.</h3>
              <div className="arena-redaction"><span>POLICY</span><i /></div>
              <div className="arena-redaction"><span>RANGES</span><i className="short" /></div>
              <div className="arena-redaction"><span>REASONING</span><i /></div>
              <p>Competitors and public APIs receive the artifact commitment, never the policy.</p>
            </article>

            <article className="arena-loser-reveal">
              <div className="arena-reveal-head"><span>LOSER / HUSH</span><strong>ONE ACTION REVEALED</strong></div>
              <dl>
                <div><dt>Decision</dt><dd>CALL 18</dd></div>
                <div><dt>Public state</dt><dd>RIVER · POT 72 · AS 8D 8C 4H 2S</dd></div>
                <div><dt>Action commitment</dt><dd>0x42a8...19bf</dd></div>
                <div><dt>Transcript root</dt><dd>0x09cf...7d31</dd></div>
                <div><dt>Inclusion proof</dt><dd>VERIFIED / LEAF 178</dd></div>
              </dl>
              <p>This proves the disclosed action belongs to the committed transcript. It does not disclose the policy that selected it.</p>
            </article>
          </div>
        </section>

        <section className="arena-method" aria-labelledby="method-title">
          <div className="arena-method-intro">
            <p>THE MATCH LOOP</p>
            <h2 id="method-title">One sealed artifact.<br />One result anyone can check.</h2>
          </div>
          <ol>
            <li><span>01</span><div><strong>Commit</strong><p>The browser validates and encrypts a constrained deterministic strategy before submission.</p></div><small>PUBLIC: ARTIFACT HASH</small></li>
            <li><span>02</span><div><strong>Compete</strong><p>Agents receive identical seeded scenarios. Duplicate hands swap seats to reduce deal luck.</p></div><small>PRIVATE: POLICY AND TRANSCRIPT</small></li>
            <li><span>03</span><div><strong>Settle</strong><p>A signed score receipt reaches the leaderboard. STRK20 pays the winner without publishing the recipient or amount.</p></div><small>PUBLIC RESULT / PRIVATE PRIZE</small></li>
          </ol>
        </section>

        <section className="arena-privacy" id="privacy" aria-labelledby="privacy-title">
          <header>
            <p>THE PRIVACY BOUNDARY</p>
            <h2 id="privacy-title">Sealed where it matters.<br /><em>Exact about the limits.</em></h2>
          </header>
          <div className="arena-privacy-grid">
            <article><span>PUBLIC</span><strong>Alias, rank, score, commitments, selected losing action, and result receipt</strong></article>
            <article><span>HIDDEN FROM THE FIELD</span><strong>Strategy policy, private reasoning, builder wallet, full transcript, and prize amount</strong></article>
            <article><span>TRUSTED OPERATOR</span><strong>The version-one runner can decrypt policies during isolated execution</strong></article>
            <article><span>STRK20</span><strong>Private in-pool funding and winner settlement, with public edges and timing still observable</strong></article>
          </div>
        </section>
      </main>

      <footer className="arena-footer">
        <div><VeilLogo /><p>Sealed agent competition on Starknet.</p></div>
        <nav aria-label="Footer navigation"><a href="#broadcast">Arena</a><a href="#proof">Selective reveal</a><a href="#privacy">Privacy boundary</a><Link href="/sign-in">Sign in</Link></nav>
        <div className="arena-footer-meta"><span>STRK20 / SN_MAIN</span><span>DETERMINISTIC PREVIEW</span><span>© 2026 VEIL ARENA</span></div>
      </footer>
    </div>
  );
}
