export const ARENA_MATCH_START_INTERVAL_MS = 10_000;

export function arenaMatchStartsAt(input: { createdAt: Date; sequence: number }): Date {
  const sequenceOffset = Math.max(1, input.sequence);
  return new Date(input.createdAt.getTime() + sequenceOffset * ARENA_MATCH_START_INTERVAL_MS);
}

export function arenaMatchCountdownMs(startsAt: Date | string, now: Date | number): number {
  const startTime = startsAt instanceof Date ? startsAt.getTime() : new Date(startsAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  return Math.max(0, startTime - nowTime);
}

export function formatArenaMatchCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
