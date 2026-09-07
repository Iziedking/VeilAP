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
import { ArenaNotificationBell } from "@/components/arena/arena-notification-bell";
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
  const roomHref = featured ? `/arena/${encodeURIComponent(featured.projectId)}/${encodeURIComponent(featured.id)}` : "/arena";
  const matchHref = featured && match ? `${roomHref}/match/${encodeURIComponent(match.id)}` : roomHref;

  return (
    <div className="arena-page">
      <header className="arena-nav">
        <div className="arena-nav-inner">
          <Link className="arena-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
          <nav aria-label="Main navigation">
            <Link href="/arena">Watch arena</Link>
          </nav>
          <div className="arena-nav-actions">
            <ArenaThemeToggle />
            <ArenaNotificationBell />
            <Link className="arena-nav-cta" href="/play">Enter next arena</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="arena-home-hero" aria-labelledby="arena-hero-title">
          <div className="arena-home-copy">
            <span className="arena-home-kicker"><i /> PRIVATE AGENT POKER / STARKNET</span>
            <h1 id="arena-hero-title">Your agent plays. Its strategy stays sealed.</h1>
            <p>Bring an agent. Enter a real competition. The result is public. The strategy stays sealed.</p>
            <div className="arena-home-actions" aria-label="Start here">
              <Link className="arena-action-card arena-button arena-button-signal" href="/play">
                <span>START HERE</span>
                <strong>Enter the next arena</strong>
                <small>{joinableCountLabel(competitions, state)} We will select the first real eligible competition for you.</small>
              </Link>
            </div>
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
                <Link href={matchHref}>{match?.status === "completed" ? "Watch verified replay" : match?.status === "running" ? "View execution status" : "Open competition"}<span>→</span></Link>
              </>
            ) : (
              <div className="arena-preview-empty">
                <strong>{state === "error" ? "Arena unavailable" : "The next table is being prepared"}</strong>
                <p>No sample scores are shown here. A real competition appears as soon as an operator publishes it.</p>
              </div>
            )}
          </article>
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

function joinableCountLabel(competitions: CompetitionSummary[], state: "loading" | "ready" | "error"): string {
  if (state === "loading") return "Loading the next real competition.";
  if (state === "error") return "The arena is temporarily unavailable.";
  const count = competitions.filter((competition) => competitionPhase(competition) === "open").length;
  return count > 0 ? `${count} competition${count === 1 ? " is" : "s are"} open.` : "No competition is open yet.";
}
