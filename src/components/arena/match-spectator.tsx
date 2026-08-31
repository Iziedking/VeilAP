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
        if (!active) return;
        setSchedule(body.value);
        setScheduledMatch(match);
        if (publicMatch) setReceipt(publicMatch);
        setState("ready");
        if (match.status !== "completed" || !publicMatch) timer = window.setTimeout(() => void load(), 2200);
      } catch {
        if (active) setState("error");
      }
    };
    void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [projectId, seasonId, scheduledMatchId]);

  const handReceipts = receipt?.publicHandReceipts ?? [];
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
    return <div className="hub-page"><ArenaNav /><main className="room-loading"><i /><strong>Opening the sealed table</strong></main></div>;
  }
  if (state === "error" || !schedule || !scheduledMatch) {
    return <div className="hub-page"><ArenaNav /><main className="room-error"><strong>This match could not be opened.</strong><Link href={`/arena/${projectId}/${seasonId}`}>Back to the competition</Link></main></div>;
  }

  const leftName = displayName(schedule, scheduledMatch.leftAgentId);
  const rightName = displayName(schedule, scheduledMatch.rightAgentId);
  const hasReplay = handReceipts.length > 0;
  const executionState = scheduledMatch.status === "pending"
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

  return (
    <div className="hub-page spectator-page">
      <ArenaNav />
      <main>
        <header className="spectator-header">
          <div>
            <Link href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`}>← {schedule.season.name}</Link>
            <span>Match {String(scheduledMatch.sequence).padStart(2, "0")}</span>
          </div>
          <strong><i /> {executionState}</strong>
        </header>

        <section className="spectator-stage" aria-label={`${leftName} versus ${rightName}`}>
          <div className="spectator-seat is-left">
            <span>SEAT A</span>
            <strong>{leftName}</strong>
            <code>{shortCommitment(schedule.entries.find((entry) => entry.agentId === scheduledMatch.leftAgentId)?.artifactCommitment)}</code>
            <b>{hasReplay ? currentScore[scheduledMatch.leftAgentId] ?? 0 : "–"}</b>
          </div>

          <div className="spectator-table">
            <div className="spectator-table-meta">
              <span>{currentHand ? `DEAL ${String(currentHand.handNumber).padStart(2, "0")}` : "SEALED TABLE"}</span>
              <span>{currentHand?.seatSwapped ? "SEATS SWAPPED" : "PRIMARY SEATS"}</span>
            </div>
            <div className="spectator-board" aria-label="Private cards and board remain sealed">
              {[0, 1, 2, 3, 4].map((card) => <i key={card}><span>V</span></i>)}
            </div>
            {currentHand ? (
              <div className="spectator-hand-result">
                <span>HAND RESULT</span>
                <strong>{handWinner}</strong>
                <small>Board {shortCommitment(currentHand.boardCommitment)}</small>
              </div>
            ) : (
              <div className="spectator-hand-result">
                <span>{scheduledMatch.status === "running" ? "WORKER STATUS" : "MATCH STATUS"}</span>
                <strong>{scheduledMatch.status === "running" ? "Agents are deciding in private" : scheduledMatch.status.replaceAll("_", " ")}</strong>
                <small>{scheduledMatch.status === "running" ? "The signed public receipt will appear here when execution finishes." : "No private strategy or card data is exposed."}</small>
              </div>
            )}
            <div className="spectator-proof-strip">
              <span>HAND COMMITMENT</span>
              <code>{shortCommitment(currentHand?.handCommitment ?? receipt?.transcriptRoot)}</code>
            </div>
          </div>

          <div className="spectator-seat is-right">
            <span>SEAT B</span>
            <strong>{rightName}</strong>
            <code>{shortCommitment(schedule.entries.find((entry) => entry.agentId === scheduledMatch.rightAgentId)?.artifactCommitment)}</code>
            <b>{hasReplay ? currentScore[scheduledMatch.rightAgentId] ?? 0 : "–"}</b>
          </div>
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
