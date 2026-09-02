"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import {
  shortCommitment,
  type ApiEnvelope,
  type CompetitionSchedule,
  type LeaderboardEntry,
  type PublicArena,
  type PublicMatch,
} from "@/components/arena/arena-types";
import { apiFetch } from "@/lib/api/client";

type RoomView = "matches" | "leaderboard" | "rules";

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function buildLeaderboard(schedule: CompetitionSchedule, matches: PublicMatch[]): LeaderboardEntry[] {
  const rows = new Map(schedule.entries.map((entry) => [entry.agentId, {
    agentId: entry.agentId,
    artifactCommitment: entry.artifactCommitment,
    displayName: entry.displayName,
    losses: 0,
    points: 0,
    wins: 0,
    matches: 0,
    ties: 0,
  }]));
  for (const match of matches) {
    for (const player of match.players) {
      const row = rows.get(player.agentId);
      if (!row) continue;
      row.matches += 1;
      if (match.winner === "tie") {
        row.ties += 1;
        row.points += 1;
      } else if (match.winner === player.agentId) {
        row.wins += 1;
        row.points += 3;
      } else {
        row.losses += 1;
      }
    }
  }
  return [...rows.values()].sort((left, right) => right.points - left.points || right.wins - left.wins || left.displayName.localeCompare(right.displayName));
}

export function CompetitionRoom({ projectId, seasonId }: { projectId: string; seasonId: string }) {
  const [schedule, setSchedule] = useState<CompetitionSchedule | null>(null);
  const [arena, setArena] = useState<PublicArena | null>(null);
  const [view, setView] = useState<RoomView>("matches");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [scheduleResponse, arenaResponse] = await Promise.all([
          apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}`),
          apiFetch(`/api/projects/${encodeURIComponent(projectId)}/matches`),
        ]);
        const scheduleBody = await scheduleResponse.json() as ApiEnvelope<CompetitionSchedule>;
        const arenaBody = await arenaResponse.json() as ApiEnvelope<PublicArena>;
        if (!active) return;
        if (!scheduleResponse.ok || !scheduleBody.ok || !arenaResponse.ok || !arenaBody.ok) throw new Error("ROOM_UNAVAILABLE");
        setSchedule(scheduleBody.value);
        setArena(arenaBody.value);
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [projectId, seasonId]);

  const seasonMatches = useMemo(() => {
    if (!schedule || !arena) return [];
    const allowed = new Set(schedule.matches.map((match) => match.matchId).filter(Boolean));
    return arena.matches.filter((match) => allowed.has(match.matchId));
  }, [arena, schedule]);
  const leaderboard = useMemo(() => schedule ? buildLeaderboard(schedule, seasonMatches) : [], [schedule, seasonMatches]);
  const names = useMemo(() => new Map(schedule?.entries.map((entry) => [entry.agentId, entry.displayName]) ?? []), [schedule]);
  const watchMatch = schedule?.matches.find((match) => match.status === "running")
    ?? [...(schedule?.matches ?? [])].reverse().find((match) => match.status === "completed")
    ?? schedule?.matches[0];

  if (state === "loading") {
    return <div className="hub-page"><ArenaNav backHref="/arena" backLabel="Arena" /><main className="room-loading"><i /><strong>Opening the competition room</strong></main></div>;
  }
  if (state === "error" || !schedule) {
    return <div className="hub-page"><ArenaNav backHref="/arena" backLabel="Arena" /><main className="room-error"><strong>This competition could not be opened.</strong><Link href="/arena">Back to the arena</Link></main></div>;
  }

  const season = schedule.season;
  const completed = schedule.matches.filter((match) => match.status === "completed").length;
  const running = schedule.matches.some((match) => match.status === "running");
  const phase = season.status === "open" ? "open for agents" : completed === schedule.matches.length && schedule.matches.length > 0 ? "complete" : running ? "live now" : "draw locked";
  const currentMatches = schedule.matches.filter((match) => match.status !== "completed");
  const historyMatches = schedule.matches.filter((match) => match.status === "completed");

  const renderMatch = (match: CompetitionSchedule["matches"][number]) => {
    const receipt = match.matchId ? seasonMatches.find((candidate) => candidate.matchId === match.matchId) : undefined;
    return (
      <Link className={`room-match is-${match.status}`} href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}/match/${encodeURIComponent(match.id)}`} key={match.id}>
        <span className="room-match-index">{String(match.sequence).padStart(2, "0")}</span>
        <div className="room-match-players">
          <strong>{(names.get(match.leftAgentId) ?? match.leftAgentId).toUpperCase()}</strong>
          <span>VS</span>
          <strong>{(names.get(match.rightAgentId) ?? match.rightAgentId).toUpperCase()}</strong>
        </div>
        <div className="room-match-result">
          {receipt ? <b>{receipt.score[match.leftAgentId] ?? 0} : {receipt.score[match.rightAgentId] ?? 0}</b> : <b>{match.status === "scheduled" ? "QUEUED" : match.status === "failed" ? "STOPPED" : "RUNNING"}</b>}
          <small>{match.status === "completed" ? `${match.hands} duplicate deals · verified replay` : match.status === "failed" ? "Execution stopped · inspect the table" : `${match.hands} duplicate deals · worker queue`}</small>
        </div>
        <span className="room-match-open">{match.status === "completed" ? "Watch replay" : match.status === "running" ? "Watch live" : match.status === "failed" ? "View status" : "Open table"} →</span>
      </Link>
    );
  };

  return (
    <div className="hub-page competition-room">
      <ArenaNav backHref="/arena" backLabel="Arena" />
      <main>
        <section className="room-hero">
          <div className="room-back"><Link href="/arena">← Competition floor</Link><span>{(season.templateId ?? "custom").replaceAll("_", " ")}</span></div>
          <div className="room-hero-grid">
            <div>
              <span className="hub-kicker"><i /> {phase}</span>
              <h1>{season.name}</h1>
              <p>{season.entryCount} sealed agents. {completed} of {schedule.matches.length} matches complete. The scoreboard is public while every policy stays sealed.</p>
              <div className="room-actions">
                {season.status === "open" && season.entryMode === "open" ? <Link className="room-primary" href={`/play?project=${encodeURIComponent(projectId)}&season=${encodeURIComponent(seasonId)}`}>Enter this competition</Link> : null}
                {watchMatch ? <Link className="room-primary" href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}/match/${encodeURIComponent(watchMatch.id)}`}>{watchMatch.status === "running" ? "Watch the live table" : watchMatch.status === "completed" ? "Watch latest replay" : "Open the first table"}</Link> : null}
                <Link className="room-secondary" href={`/arena-console?project=${encodeURIComponent(projectId)}&season=${encodeURIComponent(seasonId)}`}>Operator desk</Link>
              </div>
            </div>
            <div className="room-scoreboard">
              <header><span>COMPETITION STATUS</span><strong><i /> {phase}</strong></header>
              <div><strong>{String(completed).padStart(2, "0")}</strong><span>matches complete</span></div>
              <dl>
                <div><dt>Agents</dt><dd>{season.entryCount}/{season.maxEntries}</dd></div>
                <div><dt>Locks</dt><dd>{readableDate(season.locksAt)}</dd></div>
                <div><dt>Reward</dt><dd>{season.templateId === "playground" && !season.prizeStatus ? "none" : season.prizeStatus?.replaceAll("_", " ") ?? "not guaranteed"}</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="room-console">
          <nav className="room-tabs" aria-label="Competition views">
            {(["matches", "leaderboard", "rules"] as const).map((tab) => <button type="button" className={view === tab ? "is-active" : ""} aria-pressed={view === tab} onClick={() => setView(tab)} key={tab}>{tab}</button>)}
          </nav>

          {view === "matches" ? (
            <div className="room-match-list">
              {currentMatches.length ? <>
                <div className="room-match-section-heading"><strong>Current tables</strong><span>{currentMatches.length} queued or active</span></div>
                {currentMatches.map(renderMatch)}
              </> : null}
              {historyMatches.length ? <>
                <div className="room-match-section-heading is-history"><strong>Completed history</strong><span>{historyMatches.length} verified {historyMatches.length === 1 ? "replay" : "replays"}</span></div>
                {historyMatches.map(renderMatch)}
              </> : null}
              {!schedule.matches.length ? <div className="room-empty"><strong>The draw has not been locked.</strong><p>Matches appear after the roster reaches its minimum and the operator locks the competition.</p></div> : null}
            </div>
          ) : null}

          {view === "leaderboard" ? (
            <div className="room-leaderboard" role="table" aria-label="Competition leaderboard">
              <div className="room-leader-row is-head" role="row"><span>Rank</span><span>Agent</span><span>Record</span><span>Points</span><span>Policy</span></div>
              {leaderboard.map((entry, index) => <div className={index === 0 ? "room-leader-row is-first" : "room-leader-row"} role="row" key={entry.agentId}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{entry.displayName}</strong><small>{entry.agentId}</small></span><span>{entry.wins}W {entry.losses}L {entry.ties}T</span><span><b>{entry.points}</b></span><span><code>{shortCommitment(entry.artifactCommitment)}</code><small>sealed</small></span></div>)}
              {!leaderboard.length ? <div className="room-empty"><strong>No agents have entered.</strong><p>The leaderboard starts with the first approved package.</p></div> : null}
            </div>
          ) : null}

          {view === "rules" ? (
            <div className="room-rules">
              <article><span>PAIRING</span><strong>{season.rules?.pairingMode.replaceAll("_", " ") ?? "fixed draw"}</strong><p>{season.rules?.handsPerMatch ?? 0} hands per match. Seats swap on every duplicate deal.</p></article>
              <article><span>AGENT UPDATES</span><strong>{season.rules?.resubmissionPolicy.replaceAll("_", " ") ?? "fixed"}</strong><p>A replacement creates a new sealed version. Previous packages remain immutable.</p></article>
              <article><span>PUBLIC REVEAL</span><strong>losing action only</strong><p>The winner policy remains sealed. An authorized audit may reveal one committed losing action.</p></article>
              <article><span>RULES COMMITMENT</span><code>{shortCommitment(season.rulesCommitment)}</code><p>The draw is tied to this immutable tournament configuration.</p></article>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
