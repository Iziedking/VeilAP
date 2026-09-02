"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import {
  shortCommitment,
  type ApiEnvelope,
  type CompetitionSchedule,
  type PublicHandReceipt,
  type PublicMatch,
  type ScheduledMatch,
} from "@/components/arena/arena-types";
import { apiFetch } from "@/lib/api/client";

type LoadState = "loading" | "ready" | "error";

type ViewerEntry = {
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  version: number;
};

type ViewerSession = {
  xVerification?: {
    identity?: {
      username: string;
      profileImageUrl?: string | null;
    } | null;
  };
};

function displayName(schedule: CompetitionSchedule, agentId: string): string {
  return schedule.entries.find((entry) => entry.agentId === agentId)?.displayName ?? agentId;
}

function scoreThrough(receipts: readonly PublicHandReceipt[], index: number): Record<string, number> {
  const score: Record<string, number> = {};
  for (const receipt of receipts.slice(0, index + 1)) {
    if (receipt.winner !== "tie") score[receipt.winner] = (score[receipt.winner] ?? 0) + 1;
  }
  return score;
}

function viewerOwnsSeat(viewerEntry: ViewerEntry | null, agentId: string): boolean {
  return viewerEntry?.agentId === agentId;
}

export function MatchSpectator({
  projectId,
  seasonId,
  scheduledMatchId,
}: {
  projectId: string;
  seasonId: string;
  scheduledMatchId: string;
}) {
  const [schedule, setSchedule] = useState<CompetitionSchedule | null>(null);
  const [scheduledMatch, setScheduledMatch] = useState<ScheduledMatch | null>(null);
  const [receipt, setReceipt] = useState<PublicMatch | null>(null);
  const [viewerEntry, setViewerEntry] = useState<ViewerEntry | null>(null);
  const [viewerProfileImageUrl, setViewerProfileImageUrl] = useState<string | null>(null);
  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const load = async () => {
      try {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}`);
        const body = await response.json() as ApiEnvelope<CompetitionSchedule>;
        if (!response.ok || !body.ok) throw new Error("SCHEDULE_UNAVAILABLE");
        const match = body.value.matches.find((candidate) => candidate.id === scheduledMatchId);
        if (!match) throw new Error("MATCH_NOT_FOUND");
        let publicMatch: PublicMatch | null = null;
        if (match.matchId) {
          const matchResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/matches/${encodeURIComponent(match.matchId)}`);
          const matchBody = await matchResponse.json() as ApiEnvelope<PublicMatch>;
          if (matchResponse.ok && matchBody.ok) publicMatch = matchBody.value;
        }

        let privateEntry: ViewerEntry | null = null;
        try {
          const entryResponse = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}/join`);
          const entryBody = await entryResponse.json() as ApiEnvelope<ViewerEntry | null>;
          if (entryResponse.ok && entryBody.ok) privateEntry = entryBody.value;
        } catch {
          privateEntry = null;
        }

        let privateUsername: string | null = null;
        let privateProfileImageUrl: string | null = null;
        try {
          const sessionResponse = await apiFetch("/api/auth/session");
          const sessionBody = await sessionResponse.json() as ApiEnvelope<ViewerSession | null>;
          if (sessionResponse.ok && sessionBody.ok && sessionBody.value) {
            privateUsername = sessionBody.value.xVerification?.identity?.username ?? null;
            privateProfileImageUrl = sessionBody.value.xVerification?.identity?.profileImageUrl ?? null;
          }
        } catch {
          privateUsername = null;
          privateProfileImageUrl = null;
        }

        if (!active) return;
        setSchedule(body.value);
        setScheduledMatch(match);
        setReceipt(publicMatch);
        setViewerEntry(privateEntry);
        setViewerUsername(privateUsername);
        setViewerProfileImageUrl(privateProfileImageUrl);
        setState("ready");
        if (match.status !== "completed" || !publicMatch) timer = window.setTimeout(() => void load(), 2200);
      } catch {
        if (active) setState("error");
      }
    };
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [projectId, seasonId, scheduledMatchId]);

  const handReceipts = useMemo(() => receipt?.publicHandReceipts ?? [], [receipt?.publicHandReceipts]);
  const currentHand = handReceipts[activeIndex];
  const currentScore = useMemo(() => scoreThrough(handReceipts, activeIndex), [activeIndex, handReceipts]);

  useEffect(() => {
    if (!playing || handReceipts.length < 2 || activeIndex >= handReceipts.length - 1) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setActiveIndex((index) => Math.min(index + 1, handReceipts.length - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, handReceipts.length, playing]);

  if (state === "loading") {
    return <div className="hub-page"><ArenaNav backHref={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`} backLabel="Competition" /><main className="room-loading"><i /><strong>Opening the sealed table</strong></main></div>;
  }
  if (state === "error" || !schedule || !scheduledMatch) {
    return <div className="hub-page"><ArenaNav backHref={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`} backLabel="Competition" /><main className="room-error"><strong>This match could not be opened.</strong><Link href={`/arena/${projectId}/${seasonId}`}>Back to the competition</Link></main></div>;
  }

  const leftName = displayName(schedule, scheduledMatch.leftAgentId);
  const rightName = displayName(schedule, scheduledMatch.rightAgentId);
  const leftEntry = schedule.entries.find((entry) => entry.agentId === scheduledMatch.leftAgentId);
  const rightEntry = schedule.entries.find((entry) => entry.agentId === scheduledMatch.rightAgentId);
  const hasReplay = handReceipts.length > 0;
  const viewerIsLeft = viewerOwnsSeat(viewerEntry, scheduledMatch.leftAgentId);
  const viewerIsRight = viewerOwnsSeat(viewerEntry, scheduledMatch.rightAgentId);
  const privateView = viewerIsLeft || viewerIsRight;
  const executionState = scheduledMatch.status === "scheduled"
    ? "DRAW WAITING"
    : scheduledMatch.status === "running"
      ? "SEALED EXECUTION"
      : scheduledMatch.status === "failed"
        ? "EXECUTION STOPPED"
        : hasReplay
          ? "VERIFIED REPLAY"
          : "FINAL RECEIPT";
  const handWinner = currentHand?.winner === "tie"
    ? "Tie"
    : currentHand?.winner
      ? displayName(schedule, currentHand.winner)
      : null;
  const liveDescription = scheduledMatch.status === "running"
    ? "The worker has claimed this table. Both agents are deciding inside the sealed runner."
    : scheduledMatch.status === "scheduled"
      ? "The next table is in the draw. It will open when the worker claims the match."
      : scheduledMatch.status === "failed"
        ? "Execution stopped before a public receipt could be issued."
        : `${handReceipts.length} public hand ${handReceipts.length === 1 ? "receipt" : "receipts"} are available to replay.`;

  const renderSeat = ({
    side,
    agentId,
    name,
    artifactCommitment,
    score,
  }: {
    side: "A" | "B";
    agentId: string;
    name: string;
    artifactCommitment?: string;
    score: number | string;
  }) => {
    const yours = viewerOwnsSeat(viewerEntry, agentId);
    return (
      <article className={`spectator-seat ${side === "A" ? "is-left" : "is-right"} ${yours ? "is-yours" : "is-sealed"}`}>
        <header>
          <span>SEAT {side}</span>
          <b>{yours ? "YOUR AGENT" : privateView ? "SEALED OPPONENT" : "PUBLIC SEAT"}</b>
        </header>
        <div className="spectator-seat-identity">
          {yours && viewerProfileImageUrl ? (
            <span className="spectator-avatar" style={{ backgroundImage: `url(${viewerProfileImageUrl})` }} role="img" aria-label={`${viewerUsername ?? name} X profile`} />
          ) : (
            <span className="spectator-avatar is-fallback" aria-hidden="true">{yours && viewerUsername ? "X" : name.slice(0, 1)}</span>
          )}
          <strong>{name}</strong>
        </div>
        <code>{shortCommitment(artifactCommitment)}</code>
        <small>{yours ? `PRIVATE PLAYER VIEW${viewerUsername ? ` / @${viewerUsername}` : ""}` : "STRATEGY SEALED"}</small>
        <b className="spectator-seat-score">{score}</b>
      </article>
    );
  };

  return (
    <div className="hub-page spectator-page">
      <ArenaNav backHref={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`} backLabel="Competition" />
      <main>
        <header className="spectator-header">
          <div>
            <Link href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`}>← {schedule.season.name}</Link>
            <span>Match {String(scheduledMatch.sequence).padStart(2, "0")}</span>
          </div>
          <strong><i /> {executionState}</strong>
        </header>

        <div className={`spectator-room-banner ${privateView ? "is-private" : "is-public"}`}>
          <div><i /> <strong>{privateView ? "PRIVATE PLAYER VIEW" : "PUBLIC BROADCAST"}</strong></div>
          <span>{privateView ? "Your agent is highlighted in this browser. Opponent strategy remains sealed." : "Results, timing, and proof are public. Agent strategy remains sealed."}</span>
        </div>

        <section className="spectator-stage" aria-label={`${leftName} versus ${rightName}`}>
          {renderSeat({ side: "A", agentId: scheduledMatch.leftAgentId, name: leftName, artifactCommitment: leftEntry?.artifactCommitment, score: hasReplay ? currentScore[scheduledMatch.leftAgentId] ?? 0 : "–" })}

          <div className={`spectator-table is-${scheduledMatch.status}`}>
            <div className="spectator-table-meta">
              <span><i className="spectator-live-dot" /> {scheduledMatch.status === "completed" ? "REPLAY TABLE" : "LIVE TABLE"}</span>
              <span>{currentHand ? `DEAL ${String(currentHand.handNumber).padStart(2, "0")}` : "SEALED TABLE"}</span>
              <span>{currentHand?.seatSwapped ? "SEATS SWAPPED" : "PRIMARY SEATS"}</span>
            </div>
            <div className="spectator-board" aria-label="Private cards and board remain sealed">
              <span className="spectator-board-mark">V</span>
              <div className="spectator-board-cards">
                {[0, 1, 2, 3, 4].map((card) => <i key={card}><span>?</span></i>)}
              </div>
              <small>CARDS SEALED</small>
            </div>
            {currentHand ? (
              <div className="spectator-hand-result">
                <span>HAND RESULT</span>
                <strong>{handWinner}</strong>
                <small>Board commitment {shortCommitment(currentHand.boardCommitment)}</small>
              </div>
            ) : (
              <div className="spectator-hand-result">
                <span>{scheduledMatch.status === "running" ? "WORKER STATUS" : "MATCH STATUS"}</span>
                <strong>{scheduledMatch.status === "running" ? "Agents are deciding in private" : scheduledMatch.status.replaceAll("_", " ")}</strong>
                <small>{scheduledMatch.status === "running" ? "The signed public receipt will appear here when execution finishes." : "No private strategy or card data is exposed."}</small>
              </div>
            )}
            <div className="spectator-live-strip">
              <span><i /> {scheduledMatch.status === "completed" ? "RECEIPT STREAM" : "LIVE EXECUTION"}</span>
              <p>{liveDescription}</p>
            </div>
            <div className="spectator-proof-strip">
              <span>HAND COMMITMENT</span>
              <code>{shortCommitment(currentHand?.handCommitment ?? receipt?.transcriptRoot)}</code>
            </div>
          </div>

          {renderSeat({ side: "B", agentId: scheduledMatch.rightAgentId, name: rightName, artifactCommitment: rightEntry?.artifactCommitment, score: hasReplay ? currentScore[scheduledMatch.rightAgentId] ?? 0 : "–" })}
        </section>

        <section className="spectator-feed" aria-label="Table status">
          <header><strong>TABLE FEED</strong><span>{scheduledMatch.status === "completed" ? "RECEIPTS PUBLISHED" : "PRIVATE RUNNER"}</span></header>
          <ol>
            <li className="is-done"><i /> <span>Agent packages sealed</span><small>Commitments visible</small></li>
            <li className={scheduledMatch.status === "scheduled" ? "is-current" : "is-done"}><i /> <span>{scheduledMatch.status === "scheduled" ? "Table waiting for worker" : "Worker claimed table"}</span><small>{scheduledMatch.status === "scheduled" ? "No cards or actions are shown" : "Decisions stay private"}</small></li>
            <li className={hasReplay ? "is-done" : "is-current"}><i /> <span>{hasReplay ? `${handReceipts.length} hand receipts published` : "Public receipt pending"}</span><small>{hasReplay ? "Replay is available below" : "The table will update automatically"}</small></li>
          </ol>
        </section>

        <section className="spectator-console">
          <div className="spectator-controls">
            <button type="button" disabled={!hasReplay || activeIndex === 0} onClick={() => { setPlaying(false); setActiveIndex((index) => Math.max(0, index - 1)); }}>← Previous</button>
            <button type="button" className="is-primary" disabled={!hasReplay} onClick={() => {
              if (activeIndex >= handReceipts.length - 1) setActiveIndex(0);
              setPlaying((value) => !value);
            }}>{activeIndex >= handReceipts.length - 1 ? "Replay match" : playing ? "Pause replay" : "Play replay"}</button>
            <button type="button" disabled={!hasReplay || activeIndex >= handReceipts.length - 1} onClick={() => { setPlaying(false); setActiveIndex((index) => Math.min(handReceipts.length - 1, index + 1)); }}>Next →</button>
          </div>
          <div className="spectator-progress" aria-label="Match replay progress">
            {hasReplay ? handReceipts.map((hand, index) => (
              <button type="button" className={index === activeIndex ? "is-active" : index < activeIndex ? "is-past" : ""} aria-label={`Open receipt ${index + 1}`} onClick={() => { setPlaying(false); setActiveIndex(index); }} key={hand.handCommitment} />
            )) : <span>{scheduledMatch.status === "running" ? "Waiting for the signed match receipt" : "No hand replay is available for this match"}</span>}
          </div>
          <dl className="spectator-receipt">
            <div><dt>Transcript root</dt><dd>{shortCommitment(receipt?.transcriptRoot)}</dd></div>
            <div><dt>Seed commitment</dt><dd>{shortCommitment(receipt?.seedCommitment)}</dd></div>
            <div><dt>Receipt</dt><dd>{receipt?.signedReceipt ? "Signed" : receipt ? "Unsigned" : "Pending"}</dd></div>
            <div><dt>Public reveal</dt><dd>{receipt?.selectiveReveal ? `Losing action: ${receipt.selectiveReveal.action}` : "None"}</dd></div>
          </dl>
        </section>
      </main>
    </div>
  );
}
