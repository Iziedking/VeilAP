import { MatchSpectator } from "@/components/arena/match-spectator";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ projectId: string; seasonId: string; scheduledMatchId: string }>;
}) {
  const { projectId, seasonId, scheduledMatchId } = await params;
  return <MatchSpectator projectId={projectId} seasonId={seasonId} scheduledMatchId={scheduledMatchId} />;
}
