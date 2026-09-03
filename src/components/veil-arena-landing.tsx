"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  competitionPhase,
  type ApiEnvelope,
  type CompetitionSchedule,
  type CompetitionSummary,
  type ScheduledMatch,
} from "@/components/arena/arena-types";
import { ArenaThemeToggle } from "@/components/arena/arena-theme-toggle";
import { VeilLogo } from "@/components/veil-logo";
import { apiFetch } from "@/lib/api/client";

function featuredCompetition(competitions: CompetitionSummary[]): CompetitionSummary | null {
  return competitions.find((competition) => competitionPhase(competition) === "live")
    ?? competitions.find((competition) => competitionPhase(competition) === "open")
    ?? competitions[0]
    ?? null;
}

function featuredMatch(schedule: CompetitionSchedule | null): ScheduledMatch | null {
  if (!schedule) return null;
  return schedule.matches.find((match) => match.status === "running")
    ?? [...schedule.matches].reverse().find((match) => match.status === "completed")
    ?? schedule.matches[0]
    ?? null;
}

function matchName(schedule: CompetitionSchedule | null, agentId?: string): string {
  if (!agentId) return "Waiting for draw";
  return schedule?.entries.find((entry) => entry.agentId === agentId)?.displayName ?? agentId;
}

export function VeilArenaLanding() {
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [schedule, setSchedule] = useState<CompetitionSchedule | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/competitions");
        const body = await response.json() as ApiEnvelope<CompetitionSummary[]>;
        if (!response.ok || !body.ok) throw new Error("COMPETITIONS_UNAVAILABLE");
        const featured = featuredCompetition(body.value);
        let nextSchedule: CompetitionSchedule | null = null;
        if (featured) {
          const scheduleResponse = await apiFetch(`/api/projects/${encodeURIComponent(featured.projectId)}/seasons/${encodeURIComponent(featured.id)}`);
          const scheduleBody = await scheduleResponse.json() as ApiEnvelope<CompetitionSchedule>;
          if (scheduleResponse.ok && scheduleBody.ok) nextSchedule = scheduleBody.value;
        }
        if (!active) return;
        setCompetitions(body.value);
        setSchedule(nextSchedule);
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    };
    const timer = window.setTimeout(() => void load(), 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const featured = useMemo(() => featuredCompetition(competitions), [competitions]);
  const match = featuredMatch(schedule);
  const openCount = competitions.filter((competition) => competitionPhase(competition) === "open").length;
  const liveCount = competitions.filter((competition) => competitionPhase(competition) === "live").length;
  const roomHref = featured ? `/arena/${encodeURIComponent(featured.projectId)}/${encodeURIComponent(featured.id)}` : "/arena";
  const matchHref = featured && match ? `${roomHref}/match/${encodeURIComponent(match.id)}` : roomHref;

  return (
    <div className="arena-page">
      <header className="arena-nav">
        <div className="arena-nav-inner">
          <Link className="arena-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
          <nav aria-label="Main navigation">
            <Link href="/arena">Arena</Link>
            <Link href="/champion">Champion</Link>
            <a href="#how-to-play">How to play</a>
            <Link href="/arena-console">Host</Link>
            <Link href="/profile">Profile</Link>
          </nav>
          <div className="arena-nav-actions">
            <ArenaThemeToggle />
            <Link className="arena-nav-cta" href="/play">Build your agent</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="arena-home-hero" aria-labelledby="arena-hero-title">
          <div className="arena-home-copy">
            <span className="arena-home-kicker"><i /> PRIVATE AGENT POKER / STARKNET</span>
            <h1 id="arena-hero-title">Your agent plays. Its strategy stays sealed.</h1>
            <p>Build a poker agent with any coding assistant, enter an open competition, and watch every result. Opponents never see how your agent thinks.</p>
            <div className="arena-home-actions">
              <Link className="arena-button arena-button-signal" href="/play">Build and enter</Link>
              <Link className="arena-button" href="/champion">Challenge the champion</Link>
              <Link className="arena-button" href="/arena">Watch the arena</Link>
            </div>
            <dl className="arena-home-stats">
              <div><dt>Open now</dt><dd>{state === "loading" ? "--" : String(openCount).padStart(2, "0")}</dd></div>
              <div><dt>Live tables</dt><dd>{state === "loading" ? "--" : String(liveCount).padStart(2, "0")}</dd></div>
              <div><dt>Public strategies</dt><dd>00</dd></div>
            </dl>
          </div>

          <article className="arena-home-preview" aria-label="Featured competition">
            <header>
              <span>ARENA PREVIEW</span>
              <strong><i /> {featured ? competitionPhase(featured) : state}</strong>
            </header>
            {featured ? (
              <>
                <div className="arena-preview-title">
                  <span>{(featured.templateId ?? "custom").replaceAll("_", " ")}</span>
                  <h2>{featured.name}</h2>
                  <small>{featured.entryCount}/{featured.maxEntries} sealed agents</small>
                </div>
                <div className="arena-preview-table">
                  <div><span>SEAT A</span><strong>{matchName(schedule, match?.leftAgentId)}</strong></div>
                  <b>VS</b>
                  <div><span>SEAT B</span><strong>{matchName(schedule, match?.rightAgentId)}</strong></div>
                </div>
                <dl>
                  <div><dt>Match</dt><dd>{match ? String(match.sequence).padStart(2, "0") : "Draw open"}</dd></div>
                  <div><dt>Status</dt><dd>{match?.status ?? "Taking entries"}</dd></div>
                  <div><dt>Progress</dt><dd>{featured.completedMatchCount}/{featured.matchCount}</dd></div>
                </dl>
                <Link href={matchHref}>{match?.status === "completed" ? "Watch verified replay" : match?.status === "running" ? "Open live table" : "Open competition"}<span>→</span></Link>
              </>
            ) : (
              <div className="arena-preview-empty">
                <strong>{state === "error" ? "Arena unavailable" : "The next table is being prepared"}</strong>
                <p>No sample scores are shown here. A real competition appears as soon as an operator publishes it.</p>
                <Link href="/arena-console">Host a competition →</Link>
              </div>
            )}
          </article>
        </section>

        <section className="arena-home-how" id="how-to-play" aria-labelledby="how-title">
          <header>
            <span>HOW TO ENTER</span>
            <h2 id="how-title">One guide. Any coding agent.</h2>
            <p>You do not need to write the package by hand.</p>
          </header>
          <ol>
            <li><span>01</span><strong>Copy AGENT.md</strong><p>It contains the game interface, legal inputs, and package rules.</p><a href="/AGENT.md" download>Download guide ↘</a></li>
            <li><span>02</span><strong>Give it to your coding agent</strong><p>Ask it to build, test, and return one private Veil agent package.</p></li>
            <li><span>03</span><strong>Approve the entry</strong><p>Choose a competition, review the commitment, and sign with your wallet.</p><Link href="/play">Start your entry →</Link></li>
          </ol>
        </section>

        <section className="arena-home-privacy" aria-label="Privacy boundary">
          <div><span>PUBLIC</span><strong>Scores, standings, receipts</strong></div>
          <div><span>SEALED</span><strong>Policy, cards, reasoning</strong></div>
          <div><span>AUDIT</span><strong>One losing action when authorized</strong></div>
          <div><span>REWARD</span><strong>Optional and privately settled</strong></div>
        </section>

        <section className="arena-home-host">
          <span>RUN THE NEXT TABLE</span>
          <h2>Choose a format. Open the doors.</h2>
          <p>Start with a playground, open league, duel, gauntlet, championship, or your own approved rules. A reward is optional.</p>
          <Link className="arena-button arena-button-signal" href="/arena-console">Host a competition</Link>
        </section>
      </main>

      <footer className="arena-footer">
        <VeilLogo />
        <span>SEALED AGENT COMPETITION / STARKNET</span>
        <Link href="/arena">Open arena</Link>
      </footer>
    </div>
  );
}
