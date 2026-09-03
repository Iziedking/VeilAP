"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import { arenaMatchCountdownMs, formatArenaMatchCountdown } from "@/domain/arena/match-schedule";
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

type PrivateCard = {
  rank: number;
  suit: "clubs" | "diamonds" | "hearts" | "spades";
};

type PrivateMatch = {
  matchId: string;
  agentId: string;
  displayName: string;
  handCount: number;
  hands: Array<{
    handNumber: number;
    seatSwapped: boolean;
    board: PrivateCard[];
    holeCards: [PrivateCard, PrivateCard];
    action: "fold" | "check" | "call" | "raise";
    position: "button" | "big_blind";
    winner: string | "tie";
    handCommitment: string;
  }>;
};

type TableSound = "deal" | "check" | "call" | "raise" | "fold" | "showdown" | "win" | "tie" | "complete";

function formatCard(card: PrivateCard): string {
  const rank = card.rank <= 10 ? String(card.rank) : ({ 11: "J", 12: "Q", 13: "K", 14: "A" }[card.rank] ?? "?");
  const suit = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit];
  return `${rank}${suit}`;
}

function TableCard({ card, hidden = false }: { card?: PrivateCard; hidden?: boolean }) {
  const label = hidden ? "Sealed card" : card ? formatCard(card) : "Card unavailable";
  const red = card?.suit === "diamonds" || card?.suit === "hearts";
  return <i className={`spectator-card ${hidden ? "is-hidden" : ""} ${red ? "is-red" : ""}`} aria-label={label}><span>{hidden ? "?" : label}</span></i>;
}

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

function SpectatorAvatar({
  imageUrl,
  fallback,
  label,
}: {
  imageUrl: string | null;
  fallback: string;
  label: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  if (imageUrl && failedImageUrl !== imageUrl) {
    // X returns a provider-hosted image URL that is not a fixed local asset.
    // eslint-disable-next-line @next/next/no-img-element
    return <span className="spectator-avatar" role="img" aria-label={label}><img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedImageUrl(imageUrl)} /></span>;
  }

  return <span className="spectator-avatar is-fallback" aria-hidden="true">{fallback}</span>;
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
  const [privateMatch, setPrivateMatch] = useState<PrivateMatch | null>(null);
  const [viewerEntry, setViewerEntry] = useState<ViewerEntry | null>(null);
  const [viewerProfileImageUrl, setViewerProfileImageUrl] = useState<string | null>(null);
  const [viewerUsername, setViewerUsername] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("veil-arena-sound") === "on"; } catch { return false; }
  });
  const lastMatchStatus = useRef<string | null>(null);
  const lastPlayedHand = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const playTableSound = useCallback((sound: TableSound, enabled = soundEnabled) => {
    if (!enabled || typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current?.state === "closed"
      ? new AudioContextConstructor()
      : audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    const scheduleTone = () => {
      const start = audioContext.currentTime + 0.01;
      const tone = (frequency: number, offset: number, duration: number, volume: number, type: OscillatorType = "triangle") => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const toneStart = start + offset;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, toneStart);
        gain.gain.setValueAtTime(0.001, toneStart);
        gain.gain.exponentialRampToValueAtTime(volume, toneStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, toneStart + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + duration + 0.02);
      };
      const click = (offset: number, duration = 0.045, volume = 0.045) => {
        const buffer = audioContext.createBuffer(1, Math.max(1, Math.floor(audioContext.sampleRate * duration)), audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
        const source = audioContext.createBufferSource();
        const gain = audioContext.createGain();
        const clickStart = start + offset;
        gain.gain.setValueAtTime(volume, clickStart);
        gain.gain.exponentialRampToValueAtTime(0.001, clickStart + duration);
        source.buffer = buffer;
        source.connect(gain).connect(audioContext.destination);
        source.start(clickStart);
      };

      switch (sound) {
        case "deal":
          click(0, 0.05, 0.04); click(0.12, 0.05, 0.035); click(0.24, 0.05, 0.03); tone(220, 0, 0.22, 0.035, "sine");
          break;
        case "check":
          click(0, 0.06, 0.07); tone(520, 0, 0.1, 0.035, "square");
          break;
        case "call":
          click(0, 0.06, 0.06); tone(330, 0, 0.13, 0.04); tone(440, 0.11, 0.16, 0.04);
          break;
        case "raise":
          click(0, 0.06, 0.07); tone(330, 0, 0.14, 0.045); tone(494, 0.1, 0.18, 0.05); tone(659, 0.22, 0.22, 0.055);
          break;
        case "fold":
          click(0, 0.08, 0.055); tone(330, 0, 0.18, 0.045); tone(220, 0.13, 0.22, 0.035);
          break;
        case "showdown":
          tone(392, 0, 0.2, 0.04); tone(523, 0.14, 0.2, 0.045); tone(659, 0.28, 0.28, 0.05);
          break;
        case "win":
          tone(523, 0, 0.18, 0.045); tone(659, 0.12, 0.18, 0.05); tone(784, 0.24, 0.32, 0.055);
          break;
        case "tie":
          tone(440, 0, 0.2, 0.045); tone(440, 0.2, 0.2, 0.045);
          break;
        case "complete":
          tone(392, 0, 0.18, 0.04); tone(523, 0.14, 0.18, 0.045); tone(784, 0.28, 0.36, 0.055);
          break;
      }
    };
    if (audioContext.state === "suspended") {
      void audioContext.resume().then(scheduleTone).catch(() => undefined);
    } else {
      scheduleTone();
    }
  }, [soundEnabled]);

  useEffect(() => {
    // Future background tracks can opt into this contract with data-veil-arena-music.
    const music = [...document.querySelectorAll<HTMLAudioElement>("audio[data-veil-arena-music]")];
    music.filter((audio) => !audio.paused).forEach((audio) => audio.pause());
    document.documentElement.dataset.arenaSpectator = "true";
    window.dispatchEvent(new CustomEvent("veil-arena-spectator-audio", { detail: { mode: "table" } }));
    return () => {
      delete document.documentElement.dataset.arenaSpectator;
      window.dispatchEvent(new CustomEvent("veil-arena-spectator-audio", { detail: { mode: "background" } }));
    };
  }, []);

  useEffect(() => () => {
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext) void audioContext.close();
  }, []);

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

        let participantMatch: PrivateMatch | null = null;
        if (privateEntry && match.status === "completed") {
          try {
            const privateResponse = await apiFetch(
              `/api/projects/${encodeURIComponent(projectId)}/seasons/${encodeURIComponent(seasonId)}/matches/${encodeURIComponent(scheduledMatchId)}/private`,
            );
            const privateBody = await privateResponse.json() as ApiEnvelope<PrivateMatch>;
            if (privateResponse.ok && privateBody.ok) participantMatch = privateBody.value;
          } catch {
            participantMatch = null;
          }
        }

        if (!active) return;
        setSchedule(body.value);
        setScheduledMatch(match);
        setReceipt(publicMatch);
        setPrivateMatch(participantMatch);
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
  const currentPrivateHand = privateMatch?.hands[activeIndex];
  const currentScore = useMemo(() => scoreThrough(handReceipts, activeIndex), [activeIndex, handReceipts]);

  useEffect(() => {
    const status = scheduledMatch?.status;
    if (!status) return;
    if (lastMatchStatus.current && lastMatchStatus.current !== status) {
      playTableSound(status === "completed" ? "complete" : status === "running" ? "deal" : "fold");
    }
    lastMatchStatus.current = status;
  }, [playTableSound, scheduledMatch?.status]);

  useEffect(() => {
    if (!currentHand) return;
    const handKey = `${currentHand.handCommitment}:${activeIndex}`;
    if (lastPlayedHand.current === handKey) return;
    lastPlayedHand.current = handKey;

    playTableSound("deal");
    const revealedAction = currentPrivateHand?.action
      ?? (receipt?.selectiveReveal?.handIndex === activeIndex ? receipt.selectiveReveal.action : undefined);
    const timers = [
      revealedAction ? window.setTimeout(() => playTableSound(revealedAction), 260) : undefined,
      window.setTimeout(() => playTableSound("showdown"), revealedAction ? 520 : 280),
      window.setTimeout(() => playTableSound(currentHand.winner === "tie" ? "tie" : "win"), revealedAction ? 820 : 580),
    ];
    return () => timers.forEach((timer) => { if (timer) window.clearTimeout(timer); });
  }, [activeIndex, currentHand, currentPrivateHand?.action, playTableSound, receipt?.selectiveReveal]);

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
      ? nowMs === null
        ? "The start window is loading. This page will update automatically."
        : arenaMatchCountdownMs(scheduledMatch.startsAt, nowMs) > 0
          ? `The table opens in ${formatArenaMatchCountdown(arenaMatchCountdownMs(scheduledMatch.startsAt, nowMs))}. The worker cannot claim it before then.`
          : "The table is ready. The worker will claim it on the next available tick."
      : scheduledMatch.status === "failed"
        ? "Execution stopped before a public receipt could be issued."
        : `${handReceipts.length} public hand ${handReceipts.length === 1 ? "receipt" : "receipts"} are available to replay.`;
  const scheduledCountdown = scheduledMatch.status === "scheduled" && nowMs !== null
    ? arenaMatchCountdownMs(scheduledMatch.startsAt, nowMs)
    : null;

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
          <SpectatorAvatar
            imageUrl={yours ? viewerProfileImageUrl : null}
            fallback={yours && viewerUsername ? "X" : name.slice(0, 1)}
            label={`${viewerUsername ?? name} X profile`}
          />
          <strong>{name}</strong>
        </div>
        <code>{shortCommitment(artifactCommitment)}</code>
        <small>{yours ? `PRIVATE PLAYER VIEW${viewerUsername ? ` / @${viewerUsername}` : ""}` : "STRATEGY SEALED"}</small>
        {yours && currentPrivateHand ? (
          <div className="spectator-hole-cards" aria-label="Your private hole cards">
            {currentPrivateHand.holeCards.map((card) => <TableCard card={card} key={formatCard(card)} />)}
            <small>YOUR CARDS</small>
          </div>
        ) : (
          <div className="spectator-hole-cards is-sealed" aria-label="Opponent cards remain sealed">
            <TableCard hidden />
            <TableCard hidden />
            <small>{yours ? "CARDS SEALED UNTIL RESULT" : "OPPONENT SEALED"}</small>
          </div>
        )}
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
          <div className="spectator-header-tools">
            <button type="button" className="spectator-sound" aria-pressed={soundEnabled} onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              try { window.localStorage.setItem("veil-arena-sound", next ? "on" : "off"); } catch { /* preference is optional */ }
              window.dispatchEvent(new CustomEvent("veil-arena-sound-preference", { detail: { enabled: next } }));
              if (next) playTableSound("check", next);
            }} aria-label={soundEnabled ? "Mute table sounds" : "Enable table sounds"}>
              {soundEnabled ? "◉ SOUND ON" : "○ SOUND OFF"}
            </button>
            <strong><i /> {executionState}</strong>
          </div>
        </header>

        <div className={`spectator-room-banner ${privateView ? "is-private" : "is-public"}`}>
          <div><i /> <strong>{privateView ? "PRIVATE PLAYER VIEW" : "PUBLIC BROADCAST"}</strong></div>
          <span>{privateView ? "Your seat is highlighted. Verified cards appear only after your match result is available; opponent cards remain sealed." : "Results, timing, and proof are public. Agent strategy and cards remain sealed."}</span>
        </div>

        <section className="spectator-stage" aria-label={`${leftName} versus ${rightName}`}>
          {renderSeat({ side: "A", agentId: scheduledMatch.leftAgentId, name: leftName, artifactCommitment: leftEntry?.artifactCommitment, score: hasReplay ? currentScore[scheduledMatch.leftAgentId] ?? 0 : "–" })}

          <div className={`spectator-table is-${scheduledMatch.status}`}>
            <div className="spectator-table-meta">
              <span><i className="spectator-live-dot" /> {scheduledMatch.status === "completed" ? "REPLAY TABLE" : "LIVE TABLE"}</span>
              <span>{currentHand ? `DEAL ${String(currentHand.handNumber).padStart(2, "0")}` : "SEALED TABLE"}</span>
              <span>{currentHand?.seatSwapped ? "SEATS SWAPPED" : "PRIMARY SEATS"}</span>
            </div>
            <div className="spectator-board" aria-label={currentPrivateHand ? "Verified board cards" : "Board cards remain sealed"}>
              <span className="spectator-board-mark">V</span>
              <div className="spectator-board-cards">
                {currentPrivateHand
                  ? currentPrivateHand.board.map((card) => <TableCard card={card} key={formatCard(card)} />)
                  : [0, 1, 2, 3, 4].map((card) => <TableCard hidden key={card} />)}
              </div>
              <small>{currentPrivateHand ? "VERIFIED BOARD" : "CARDS SEALED"}</small>
            </div>
            {currentHand ? (
              <div className="spectator-hand-result">
                <span>HAND RESULT</span>
                <strong>{handWinner}</strong>
                <small>{currentPrivateHand ? `Your ${currentPrivateHand.action} was recorded · board verified for your private view` : `Board commitment ${shortCommitment(currentHand.boardCommitment)}`}</small>
              </div>
            ) : (
              <div className="spectator-hand-result">
                <span>{scheduledMatch.status === "running" ? "WORKER STATUS" : "MATCH STATUS"}</span>
                <strong>{scheduledMatch.status === "running" ? "Agents are deciding in private" : scheduledMatch.status === "scheduled" ? scheduledCountdown === null ? "Start time loading" : scheduledCountdown > 0 ? `Starts in ${formatArenaMatchCountdown(scheduledCountdown)}` : "Ready to start" : scheduledMatch.status.replaceAll("_", " ")}</strong>
                <small>{scheduledMatch.status === "running" ? "The signed public receipt will appear here when execution finishes." : scheduledMatch.status === "scheduled" ? "The worker claims the table after its start window." : "No private strategy or card data is exposed."}</small>
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
