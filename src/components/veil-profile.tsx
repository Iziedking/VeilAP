"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ApiEnvelope, CompetitionSummary } from "@/components/arena/arena-types";
import { ArenaNav } from "@/components/arena/arena-nav";
import { XMark } from "@/components/brand/x-mark";
import { apiFetch } from "@/lib/api/client";

type ProfileIdentity = {
  username: string;
  profileImageUrl: string | null;
  connectedAt: string;
  lastVerifiedAt: string;
};

type ProfileSession = {
  walletAddress: string;
  xVerification: { configured: boolean; identity: ProfileIdentity | null };
};

type EntryVersion = {
  version: number;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  status: "active" | "retired";
  submittedAt: string;
};

type ProfileEntry = {
  projectId: string;
  seasonId: string;
  competition: CompetitionSummary;
  entry: {
    agentId: string;
    displayName: string;
    artifactCommitment: string;
    version: number;
    joinedAt: string;
    versions: EntryVersion[];
  };
};

type SavedAgent = {
  id: string;
  agentId: string;
  displayName: string;
  engineVersion: string;
  artifactCommitment: string;
  version: number;
  updatedAt: string;
};

type LoadState = "loading" | "ready" | "signed-out" | "error";
type RecentPrivateRoom = {
  projectId: string;
  seasonId: string;
  seasonName: string;
  agentId?: string;
  displayName?: string;
};

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function shortCommitment(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function ProfileAvatar({ identity }: { identity: ProfileIdentity | null }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = identity?.profileImageUrl;

  if (imageUrl && failedImageUrl !== imageUrl) {
    // X returns a provider-hosted image URL that is not a fixed local asset.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedImageUrl(imageUrl)} />;
  }

  return (
    <span className="profile-avatar-fallback" aria-hidden="true">
      {identity ? initials(identity.username) : <XMark />}
    </span>
  );
}

export function VeilProfile() {
  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<ProfileSession | null>(null);
  const [entries, setEntries] = useState<ProfileEntry[]>([]);
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [recentPrivateRoom, setRecentPrivateRoom] = useState<RecentPrivateRoom | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const sessionResponse = await apiFetch("/api/auth/session");
      const sessionBody = await sessionResponse.json() as ApiEnvelope<ProfileSession | null>;
      if (!sessionResponse.ok || !sessionBody.ok || !sessionBody.value) {
        setSession(null);
        setEntries([]);
        setState("signed-out");
        return;
      }

      setSession(sessionBody.value);
      const entriesResponse = await apiFetch("/api/profile/entries");
      const entriesBody = await entriesResponse.json() as ApiEnvelope<ProfileEntry[]>;
      if (!entriesResponse.ok || !entriesBody.ok) throw new Error("PROFILE_ENTRIES_UNAVAILABLE");
      setEntries(entriesBody.value);
      const agentsResponse = await apiFetch("/api/profile/agents");
      const agentsBody = await agentsResponse.json() as ApiEnvelope<SavedAgent[]>;
      if (agentsResponse.ok && agentsBody.ok) setAgents(agentsBody.value);
      setState("ready");
    } catch {
      setState("error");
      setError("Your profile could not be loaded. Try again in a moment.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem("veil-arena-last-entry");
        if (!raw) return;
        const value = JSON.parse(raw) as Partial<RecentPrivateRoom>;
        if (typeof value.projectId === "string" && typeof value.seasonId === "string" && typeof value.seasonName === "string") {
          setRecentPrivateRoom(value as RecentPrivateRoom);
        }
      } catch {
        setRecentPrivateRoom(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="profile-page">
      <ArenaNav backHref="/" backLabel="Home" />
      <main className="profile-main">
        <section className="profile-hero">
          <span className="hub-kicker"><i /> PLAYER PROFILE</span>
          <h1>Your agents, in one place.</h1>
          <p>Approved packages, verified identity, and competition history stay together here. Your strategy files never appear in this view.</p>
        </section>

        {state === "loading" ? <section className="profile-state"><strong>Opening your profile...</strong></section> : null}

        {state === "signed-out" ? (
          <section className="profile-state">
            <strong>Sign in to see your entries.</strong>
            <p>Your wallet session is what lets Veil Arena find your sealed agents.</p>
            <Link className="profile-primary" href="/sign-in?returnTo=%2Fprofile">Sign in with wallet →</Link>
          </section>
        ) : null}

        {state === "error" ? (
          <section className="profile-state" role="alert">
            <strong>{error}</strong>
            <button type="button" className="profile-secondary" onClick={() => void load()}>Try again</button>
          </section>
        ) : null}

        {state === "ready" && session ? (
          <>
            <section className="profile-identity" aria-label="Verified identity">
              <div className="profile-wallet">
                <span>WALLET VERIFIED</span>
                <strong>{shortAddress(session.walletAddress)}</strong>
                <small>This wallet approves entries. It cannot move funds from this session.</small>
              </div>
              <div className="profile-x">
                <ProfileAvatar identity={session.xVerification.identity} />
                <div>
                  <span><XMark /> X ACCOUNT</span>
                  <strong>{session.xVerification.identity ? `@${session.xVerification.identity.username}` : "Not verified"}</strong>
                  <small>{session.xVerification.identity ? "Verified for competition entry." : "Connect X during entry to finish verification."}</small>
                  {session.xVerification.identity && !session.xVerification.identity.profileImageUrl ? <small className="profile-x-avatar-note">X did not return a profile image. Refresh X profile to request it again.</small> : null}
                  {session.xVerification.identity ? <Link href="/play">Refresh X profile →</Link> : null}
                </div>
              </div>
            </section>

            {recentPrivateRoom ? (
              <section className="profile-private-room" aria-label="Recent private room">
                <div>
                  <span>RECENT PRIVATE ROOM</span>
                  <strong>{recentPrivateRoom.seasonName}</strong>
                  <p>{recentPrivateRoom.displayName ?? recentPrivateRoom.agentId ?? "Your sealed agent"} is linked to this private challenge. The room and its public results remain available from this account.</p>
                </div>
                <Link className="profile-primary" href={`/arena/${encodeURIComponent(recentPrivateRoom.projectId)}/${encodeURIComponent(recentPrivateRoom.seasonId)}`}>Open private room →</Link>
              </section>
            ) : null}

            <section className="profile-agent-library" aria-labelledby="profile-agent-library-title">
              <header>
                <div><span>PRIVATE AGENT LIBRARY</span><h2 id="profile-agent-library-title">Saved packages</h2></div>
                <Link href="/play">Build or update an agent →</Link>
              </header>
              {agents.length ? agents.map((agent) => (
                <article className="profile-library-row" key={agent.id}>
                  <div><strong>{agent.displayName}</strong><small>{agent.agentId} · {agent.engineVersion}</small></div>
                  <span>V{agent.version}</span>
                  <code>{shortCommitment(agent.artifactCommitment)}</code>
                  <small>Updated {dateLabel(agent.updatedAt)}</small>
                </article>
              )) : (
                <div className="profile-library-empty">No saved packages yet. Import one and save it here before choosing an arena.</div>
              )}
            </section>

            <section className="profile-entries" aria-labelledby="profile-entries-title">
              <header>
                <div><span>SEALED AGENTS</span><h2 id="profile-entries-title">Your competition entries</h2></div>
                <Link href="/play">Enter a competition →</Link>
              </header>
              {entries.length ? entries.map(({ projectId, seasonId, competition, entry }) => (
                <article className="profile-entry" key={`${projectId}:${seasonId}`}>
                  <div className="profile-entry-main">
                    <span>{competition.name}</span>
                    <h3>{entry.displayName}</h3>
                    <p>{entry.agentId} · approved {dateLabel(entry.joinedAt)}</p>
                  </div>
                  <dl>
                    <div><dt>VERSION</dt><dd>V{entry.version}</dd></div>
                    <div><dt>COMMITMENT</dt><dd><code>{shortCommitment(entry.artifactCommitment)}</code></dd></div>
                    <div><dt>HISTORY</dt><dd>{entry.versions.length} sealed version{entry.versions.length === 1 ? "" : "s"}</dd></div>
                  </dl>
                  <Link className="profile-entry-link" href={`/arena/${encodeURIComponent(projectId)}/${encodeURIComponent(seasonId)}`}>Open competition →</Link>
                </article>
              )) : (
                <div className="profile-empty">
                  <strong>No approved agents found.</strong>
                  <p>Importing a package is only a local review step. It appears here after you approve the entry with your wallet.</p>
                  <Link className="profile-primary" href="/play">Bring an agent →</Link>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
