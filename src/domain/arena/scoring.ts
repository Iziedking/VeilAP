// Shared by the result replay, leaderboard and reward settlement. No IO.
export type MatchScore = Readonly<Record<string, number>>;
export function matchWinner(score: MatchScore): string | "tie" {
  const entries = Object.entries(score);
  if (entries.length !== 2 || entries.some(([, value]) => !Number.isSafeInteger(value))) throw new Error("ARENA_SCORE_INVALID");
  const [[left, a], [right, b]] = entries;
  return a === b ? "tie" : a > b ? left : right;
}
export type Standing = { agentId: string; matches: number; wins: number; losses: number; ties: number; points: number };
export function seasonStandings(matches: readonly { engineVersion: string; score: MatchScore }[]): Standing[] {
  const standings = new Map<string, Standing>();
  for (const match of matches) {
    if (!["holdem-sealed-v0.2", "holdem-sealed-v0.3"].includes(match.engineVersion)) throw new Error("ARENA_SCORE_VERSION_UNSUPPORTED");
    const winner = matchWinner(match.score);
    for (const agentId of Object.keys(match.score)) {
      const row = standings.get(agentId) ?? { agentId, matches: 0, wins: 0, losses: 0, ties: 0, points: 0 };
      row.matches++;
      if (winner === "tie") { row.ties++; row.points += 1; }
      else if (winner === agentId) { row.wins++; row.points += 3; }
      else row.losses++;
      standings.set(agentId, row);
    }
  }
  // Alphabetic order is display-only. Equal season points remain a genuine tie.
  return [...standings.values()].sort((a, b) => b.points - a.points || a.agentId.localeCompare(b.agentId));
}
export function replayScore(match: { engineVersion: string; receiptVersion?: 2; score: MatchScore }, receipts: readonly { winner: string; scoreDelta?: MatchScore; receiptVersion?: 2 }[], index: number): MatchScore | null {
  if (!receipts.length || index < 0) return null;
  if (index >= receipts.length - 1) { matchWinner(match.score); return match.score; }
  if (match.receiptVersion === 2 || receipts.some((hand) => hand.receiptVersion === 2)) return null;
  const score: Record<string, number> = Object.fromEntries(Object.keys(match.score).map((id) => [id, 0]));
  for (const hand of receipts.slice(0, index + 1)) {
    if (match.engineVersion === "holdem-sealed-v0.2") {
      if (hand.winner !== "tie") score[hand.winner] += 1;
    } else if (match.engineVersion === "holdem-sealed-v0.3" && hand.scoreDelta) {
      for (const id of Object.keys(score)) {
        const delta = hand.scoreDelta[id];
        if (!Number.isSafeInteger(delta)) return null;
        score[id] += delta;
      }
    } else return null;
  }
  return score;
}
