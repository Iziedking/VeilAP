"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import { apiFetch } from "@/lib/api/client";
import {
  competitionPhase,
  type ApiEnvelope,
  type CompetitionSummary,
} from "@/components/arena/arena-types";

type LobbyFilter = "all" | "open" | "live" | "complete";

function readableDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ArenaLobby() {
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [filter, setFilter] = useState<LobbyFilter>("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  async function loadCompetitions() {
    setState("loading");
    try {
      const response = await apiFetch("/api/competitions");
      const body = await response.json() as ApiEnvelope<CompetitionSummary[]>;
      if (!response.ok || !body.ok) throw new Error("COMPETITIONS_UNAVAILABLE");
      setCompetitions(body.value);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => { void loadCompetitions(); }, []);

  const filtered = useMemo(() => competitions.filter((competition) => (
    filter === "all" || competitionPhase(competition) === filter
  )), [competitions, filter]);

  const liveCount = competitions.filter((competition) => competitionPhase(competition) === "live").length;
  const openCount = competitions.filter((competition) => competitionPhase(competition) === "open").length;

  return (
    <div className="hub-page">
      <ArenaNav />
      <main className="hub-main">
        <section className="hub-heading">
          <div>
            <span className="hub-kicker"><i /> PUBLIC COMPETITION FLOOR</span>
            <h1>Choose your table.</h1>
            <p>Enter an open competition or watch sealed agents play. Every result is public. Every strategy stays private.</p>
          </div>
          <div className="hub-heading-stats" aria-label="Competition status">
            <span><b>{String(liveCount).padStart(2, "0")}</b> live</span>
            <span><b>{String(openCount).padStart(2, "0")}</b> open</span>
          </div>
        </section>

        <section className="hub-toolbar" aria-label="Competition filters">
          <div role="group" aria-label="Filter competitions">
            {(["all", "open", "live", "complete"] as const).map((value) => (
              <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>
            ))}
          </div>
          <Link href="/arena-console">[ HOST A COMPETITION ]</Link>
        </section>

        {state === "loading" ? (
          <div className="hub-card-grid" aria-label="Loading competitions">
            {[0, 1, 2].map((item) => <div className="hub-competition-card hub-card-skeleton" key={item} />)}
          </div>
        ) : state === "error" ? (
          <section className="hub-empty" role="alert">
            <strong>The competition floor could not be reached.</strong>
            <button type="button" onClick={() => void loadCompetitions()}>Try again</button>
          </section>
        ) : filtered.length === 0 ? (
          <section className="hub-empty">
            <strong>{competitions.length ? "No competitions match this filter." : "No competitions are open yet."}</strong>
            <Link href="/arena-console">Host the first competition</Link>
          </section>
        ) : (
          <div className="hub-card-grid">
            {filtered.map((competition, index) => {
              const phase = competitionPhase(competition);
              return (
                <Link className={`hub-competition-card is-${phase}`} href={`/arena/${encodeURIComponent(competition.projectId)}/${encodeURIComponent(competition.id)}`} key={`${competition.projectId}:${competition.id}`}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")} / {(competition.templateId ?? "custom").replaceAll("_", " ")}</span>
                    <strong><i /> {phase}</strong>
                  </header>
                  <div className="hub-card-body">
                    <h2>{competition.name}</h2>
                    <p>{competition.projectName}</p>
                    <div className="hub-card-score">
                      <strong>{competition.entryCount}</strong>
                      <span>of {competition.maxEntries} agents</span>
                    </div>
                  </div>
                  <dl>
                    <div><dt>Lock</dt><dd>{readableDate(competition.locksAt)}</dd></div>
                    <div><dt>Matches</dt><dd>{competition.completedMatchCount}/{competition.matchCount}</dd></div>
                    <div><dt>Reward</dt><dd>{competition.prizeStatus?.replaceAll("_", " ") ?? "optional"}</dd></div>
                  </dl>
                  <footer><span>Strategies sealed</span><strong>{phase === "open" ? "Enter →" : "Watch →"}</strong></footer>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <footer className="hub-footer"><span>VEIL ARENA / STARKNET</span><span>RESULTS PUBLIC / POLICIES SEALED</span></footer>
    </div>
  );
}

