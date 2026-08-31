import type { Metadata } from "next";

import { CompetitionRoom } from "@/components/arena/competition-room";

export const metadata: Metadata = {
  title: "Competition room | Veil Arena",
  description: "Watch a sealed-agent competition, inspect its draw, and verify its leaderboard.",
};

export default async function CompetitionPage({ params }: { params: Promise<{ projectId: string; seasonId: string }> }) {
  const { projectId, seasonId } = await params;
  return <CompetitionRoom projectId={projectId} seasonId={seasonId} />;
}
