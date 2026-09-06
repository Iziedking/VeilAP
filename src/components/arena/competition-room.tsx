"use client";

import { seasonStandings } from "@/domain/arena/scoring";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import { arenaMatchCountdownMs, formatArenaMatchCountdown } from "@/domain/arena/match-schedule";
import {
  shortCommitment,
  type ApiEnvelope,
  type CompetitionSchedule,
  type LeaderboardEntry,
  type PublicArena,
  type PublicMatch,
} from "@/components/arena/arena-types";
import { apiFetch } from "@/lib/api/client";
import { recordArenaNotification } from "@/components/arena/arena-notification-bell";

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
  for (const standing of seasonStandings(matches)) {
    const row = rows.get(standing.agentId);
    if (row) Object.assign(row, standing);
  }
  return [...rows.values()].sort((left, right) => right.points - left.points || left.agentId.localeCompare(right.agentId));
}

export function CompetitionRoom({ projectId, seasonId }: { projectId: string; seasonId: string }) {
  const [schedule, setSchedule] = useState<CompetitionSchedule | null>(null);
  const [arena, setArena] = useState<PublicArena | null>(null);
  const [view, setView] = useState<RoomView>("matches");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [viewerEntry, setViewerEntry] = useState<CompetitionSchedule["entries"][number] | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [scheduleResponse, arenaResponse, entryResponse] = await Promise.all([
          apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}`),
          apiFetch(`/api/projects/${encodeURIComponent(projectId)}/matches`),
          apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}/join`),
        ]);
        const scheduleBody = await scheduleResponse.json() as ApiEnvelope<CompetitionSchedule>;
        const arenaBody = await arenaResponse.json() as ApiEnvelope<PublicArena>;
        const entryBody = await entryResponse.json() as ApiEnvelope<CompetitionSchedule["entries"][number] | null>;
        if (!active) return;
        if (!scheduleResponse.ok || !scheduleBody.ok || !arenaResponse.ok || !arenaBody.ok) throw new Error("ROOM_UNAVAILABLE");
        setSchedule(scheduleBody.value);
        setArena(arenaBody.value);
        setViewerEntry(entryResponse.ok && entryBody.ok ? entryBody.value : null);
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
  const canWatch = Boolean(viewerEntry);

  useEffect(() => {
    if (!schedule || !viewerEntry || !leaderboard.length || !schedule.matches.length) return;
    if (!schedule.matches.every((match) => match.status === "completed")) return;
    const notificationKey = `veil-arena:competition-result:${schedule.season.id}:${viewerEntry.agentId}`;
    try {
      if (window.sessionStorage.getItem(notificationKey)) return;
      const viewer = leaderboard.find((entry) => entry.agentId === viewerEntry.agentId);
      const leaders = leaderboard.filter((entry) => entry.points === leaderboard[0]?.points);
      const won = viewer && leaders.length === 1 && leaders[0]?.agentId === viewer.agentId;
      recordArenaNotification({
        title: won ? "Competition won" : "Competition complete",
        body: won ? `${viewerEntry.displayName} finished first in ${schedule.season.name}.` : `${schedule.season.name} has final results.`,
        href: `/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`,
      });
      window.sessionStorage.setItem(notificationKey, "recorded");
    } catch {
      // Completion notices are optional browser state and never affect standings.
    }
  }, [leaderboard, projectId, schedule, seasonId, viewerEntry]);

  if (state === "loading") {
    return <div className="hub-page"><ArenaNav backHref="/arena" backLabel="Arena" /><main className="room-loading"><i /><strong>Opening the competition room</strong></main></div>;
  }
  if (state === "error" || !schedule) {
    return <div className="hub-page"><ArenaNav backHref="/arena" backLabel="Arena" /><main className="room-error"><strong>This competition could not be opened.</strong><Link href="/arena">Back to the arena</Link></main></div>;
  }

  const season = schedule.season;
  const completed = schedule.matches.filter((match) => match.status === "completed").length;
  const totalMatches = season.workload?.pairingCount ?? schedule.matches.length;
  const running = schedule.matches.some((match) => match.status === "running");
  const phase = season.status === "open" ? "open for agents" : completed === totalMatches && totalMatches > 0 ? "complete" : running ? "executing" : "draw locked";
  const currentMatches = schedule.matches.filter((match) => match.status !== "completed");
  const historyMatches = schedule.matches.filter((match) => match.status === "completed");
  const nextActionMessage = canWatch && watchMatch
    ? watchMatch.status === "completed" ? "Your table is ready. Watch the verified replay when you are ready." : watchMatch.status === "running" ? "Your table is running. Open it to follow the private execution status." : "Your table is scheduled. Open it to see the countdown and next update."
    : season.status === "open" && season.entryMode === "open"
      ? "Choose Enter to use your saved agent. You can change it before approval."
      : "Results and standings are public. Table playback is reserved for entrants.";

  const renderMatch = (match: CompetitionSchedule["matches"][number]) => {
    const receipt = match.matchId ? seasonMatches.find((candidate) => candidate.matchId === match.matchId) : undefined;
    const countdown = match.status === "scheduled" && nowMs !== null
      ? arenaMatchCountdownMs(match.startsAt, nowMs)
      : null;
    const statusLabel = match.queueState === "recovering" ? "RECOVERING" : match.queueState === "retrying" ? "RETRY SCHEDULED" : match.status === "scheduled"
      ? countdown === null ? "ELIGIBILITY" : countdown > 0 ? `ELIGIBLE IN ${formatArenaMatchCountdown(countdown)}` : "WAITING FOR CAPACITY"
      : match.status === "failed" ? "STOPPED" : match.status === "running" ? "EXECUTING" : undefined;
    let matchActionLabel = "RESULT ONLY";
    if (canWatch) {
      if (match.status === "completed") matchActionLabel = "Watch replay →";
      else if (match.status === "running") matchActionLabel = "View execution →";
      else if (match.status === "failed") matchActionLabel = "View status →";
      else matchActionLabel = "Open table →";
    }
    const content = <>
        <span className="room-match-index">{String(match.sequence).padStart(2, "0")}</span>
        <div className="room-match-players">
          <strong>{(names.get(match.leftAgentId) ?? match.leftAgentId).toUpperCase()}</strong>
          <span>VS</span>
          <strong>{(names.get(match.rightAgentId) ?? match.rightAgentId).toUpperCase()}</strong>
        </div>
        <div className="room-match-result">
          {receipt ? <b>{receipt.score[match.leftAgentId] ?? 0} : {receipt.score[match.rightAgentId] ?? 0}</b> : <b>{statusLabel}</b>}
          <small>{match.status === "completed" ? `${match.hands} duplicate deals · verified replay` : match.status === "failed" ? "Execution stopped · inspect the table" : match.status === "scheduled" && countdown === 0 ? "The worker can claim this table now" : `${match.hands} duplicate deals · worker queue`}</small>
        </div>
        <span className="room-match-open">{matchActionLabel}</span>
      </>;
    return canWatch
      ? <Link className={`room-match is-${match.status}`} href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}/match/${encodeURIComponent(match.id)}`} key={match.id}>{content}</Link>
      : <article className={`room-match is-${match.status} is-public-result`} key={match.id}>{content}</article>;
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
              <p>{season.entryCount} sealed agents. {completed} of {totalMatches} matches complete. Results and standings are public; table rooms are reserved for entrants.</p>
              <div className="room-actions">
                {canWatch && watchMatch ? <Link className="room-primary" href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}/match/${encodeURIComponent(watchMatch.id)}`}>{watchMatch.status === "running" ? "View execution status" : watchMatch.status === "completed" ? "Watch latest replay" : "Open the first table"}</Link> : season.status === "open" && season.entryMode === "open" ? <Link className="room-primary" href={`/play?project=${encodeURIComponent(projectId)}&season=${encodeURIComponent(seasonId)}`}>Enter this competition</Link> : null}
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
          <div className={`room-privacy-gate ${canWatch ? "is-entered" : "is-public"}`}><strong>{canWatch ? "ENTRANT TABLE ACCESS" : "PUBLIC RESULTS VIEW"}</strong><span>{canWatch ? "Your wallet entered this competition. You can open every scheduled table and verified replay." : "Enter this competition to open its table rooms. Public visitors see completed results and leaderboard rows only."}</span></div>
          <div className="room-next-action" role="status"><span>NEXT ACTION</span><strong>{nextActionMessage}</strong></div>
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
              <div className="room-leader-row is-head" role="row"><span>Rank</span><span>Agent</span><span>Record</span><span>Sample</span><span>Points</span></div>
              {leaderboard.map((entry) => { const decisions = entry.matches * (season.rules?.handsPerMatch ?? 0) * 2; const target = season.rules?.qualificationHands ?? 0; const rank = leaderboard.findIndex((candidate) => candidate.points === entry.points) + 1; return <div className={rank === 1 ? "room-leader-row is-first" : "room-leader-row"} role="row" key={entry.agentId}><span>{String(rank).padStart(2, "0")}</span><span><strong>{entry.displayName}</strong><small>{entry.agentId} / {shortCommitment(entry.artifactCommitment)}</small></span><span>{entry.wins}W {entry.losses}L {entry.ties}T</span><span><b>{decisions.toLocaleString()}</b><small>{target ? decisions >= target ? "qualified" : `of ${target.toLocaleString()}` : "legacy season"}</small></span><span><b>{entry.points}</b></span></div>; })}
              {!leaderboard.length ? <div className="room-empty"><strong>No agents have entered.</strong><p>The leaderboard starts with the first approved package.</p></div> : null}
            </div>
          ) : null}

          {view === "rules" ? (
            <div className="room-rules">
              <article><span>PAIRING</span><strong>{season.rules?.pairingMode.replaceAll("_", " ") ?? "fixed draw"}</strong><p>{season.rules?.handsPerMatch ?? 0} duplicate deals per match. Seats swap on every deal.</p></article>
              <article><span>QUALIFICATION</span><strong>{season.rules?.qualificationHands ? `${season.rules.qualificationHands.toLocaleString()} decisions` : "legacy fixed draw"}</strong><p>Scheduled rounds continue across the published window. The highest verified points total leads after qualification.</p></article>
              <article><span>DUPLICATE STRATEGIES</span><strong>{season.rules?.duplicateStrategyPolicy === "reject_exact" ? "One active entry per exact strategy" : "Original entry rules"}</strong><p>{season.rules?.duplicateStrategyPolicy === "reject_exact" ? "Renaming a package does not make a different strategy. This rule does not verify a person’s identity." : "This competition keeps its original rules. Exact strategy matching was not required."}</p></article>
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
