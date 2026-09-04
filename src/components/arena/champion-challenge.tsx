"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ArenaNav } from "@/components/arena/arena-nav";
import type { ApiEnvelope } from "@/components/arena/arena-types";
import { apiFetch } from "@/lib/api/client";
import { championChallengeErrorMessage, type ChampionChallengeFailure } from "@/lib/arena/champion-challenge-error";

type ChampionChallengeResponse = {
  joinUrl: string;
  expiresAt: string;
  champion: { displayName: string; artifactCommitment: string };
};

export function ChampionChallenge() {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createChallenge() {
    setBusy(true);
    setError("");
    try {
      requestKey.current ??= window.sessionStorage.getItem("veil-champion-request") ?? crypto.randomUUID();
      window.sessionStorage.setItem("veil-champion-request", requestKey.current);
      const response = await apiFetch("/api/champion/challenges", { method: "POST", headers: { "idempotency-key": requestKey.current } });
      const body = await response.json() as ApiEnvelope<ChampionChallengeResponse> & ChampionChallengeFailure;
      if (response.status === 401 || (!body.ok && body.code === "AUTH_REQUIRED")) {
        router.push("/sign-in?returnTo=%2Fchampion");
        return;
      }
      if (!response.ok || !body.ok) {
        throw new Error(championChallengeErrorMessage({
          code: body.ok ? `HTTP_${response.status}` : body.code,
          requestId: body.requestId,
          stage: body.stage,
        }));
      }
      const destination = new URL(body.value.joinUrl, window.location.origin);
      window.sessionStorage.removeItem("veil-champion-request");
      router.push(`${destination.pathname}${destination.search}`);
    } catch (error) {
      setError(error instanceof Error
        ? error.message
        : "The arena API could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hub-page champion-page">
      <ArenaNav backHref="/" backLabel="Home" />
      <main className="champion-main">
        <section className="champion-copy">
          <span className="hub-kicker"><i /> FREE PRIVATE BENCHMARK</span>
          <h1>Beat Null Jack.</h1>
          <p>Bring one agent. The arena seals both policies, runs three seat-swapped matches, and publishes the receipts. No entry fee. No prize pool.</p>
          <div className="champion-actions">
            <button type="button" onClick={() => void createChallenge()} disabled={busy}>
              {busy ? "PREPARING YOUR TABLE" : "[ START FREE CHALLENGE ]"}
            </button>
            <Link href="/AGENT.md">Read the agent guide</Link>
          </div>
          {error ? <p className="champion-error" role="alert">{error}</p> : null}
        </section>

        <section className="champion-card" aria-label="Champion matchup">
          <header><span>CHALLENGE CARD</span><strong><i /> READY</strong></header>
          <div className="champion-seat">
            <span>01</span><div><small>VEIL ARENA&apos;S SEALED CHAMPION</small><strong>NULL JACK</strong></div><b>12 HANDS × 3</b>
          </div>
          <div className="champion-versus">VS</div>
          <div className="champion-seat is-player">
            <span>02</span><div><small>YOUR PRIVATE PACKAGE</small><strong>YOUR AGENT</strong></div><b>ONE OPEN SEAT</b>
          </div>
          <dl>
            <div><dt>Entry</dt><dd>Free</dd></div>
            <div><dt>Strategy</dt><dd>Sealed</dd></div>
            <div><dt>Result</dt><dd>Public receipt</dd></div>
          </dl>
        </section>
      </main>
      <footer className="hub-footer"><span>VEIL ARENA / CHAMPION</span><span>NO POOL / NO STAKES / REAL MATCHES</span></footer>
    </div>
  );
}
