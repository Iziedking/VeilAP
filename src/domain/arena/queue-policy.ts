import { arenaMatchStartsAt } from "./match-schedule";

export const MAX_MATCH_ATTEMPTS = 3;
export const MATCH_LEASE_MS = 120_000;
export type QueueRecord = { status: string; attempts: number; createdAt: Date; sequence: number; leaseExpiresAt?: Date; retryAt?: Date; startedAt?: Date };
export function retryAt(now: Date, attempts: number): Date { return new Date(now.getTime() + Math.min(60_000, 5_000 * 2 ** Math.max(0, attempts - 1))); }
export function eligibleMatch(match: QueueRecord, now: Date): boolean {
  if (match.status === "running") return !match.leaseExpiresAt || match.leaseExpiresAt <= now;
  if (match.attempts >= MAX_MATCH_ATTEMPTS) return false;
  if (match.status === "failed") return !match.retryAt || match.retryAt <= now;
  return match.status === "scheduled" && arenaMatchStartsAt(match) <= now;
}
export function queueState(match: QueueRecord, now: Date): "queued" | "waiting_for_capacity" | "running" | "recovering" | "retrying" | "failed" | "completed" {
  if (match.status === "completed") return "completed";
  if (match.status === "running" && match.leaseExpiresAt && match.leaseExpiresAt > now) return "running";
  if (match.attempts >= MAX_MATCH_ATTEMPTS) return "failed";
  if (match.status === "running") return "recovering";
  if (match.status === "failed") return "retrying";
  return arenaMatchStartsAt(match) > now ? "queued" : "waiting_for_capacity";
}
