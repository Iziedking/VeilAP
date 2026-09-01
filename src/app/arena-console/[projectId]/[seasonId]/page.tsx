import type { Metadata } from "next";

import { VeilArenaConsole } from "@/components/veil-arena-console";

export const metadata: Metadata = {
  title: "Competition control | Veil Arena",
  description: "Manage a sealed roster, run matches, and settle a Veil Arena competition.",
};

export default async function CompetitionControlPage({
  params,
}: {
  params: Promise<{ projectId: string; seasonId: string }>;
}) {
  const { projectId, seasonId } = await params;
  return <VeilArenaConsole managedProjectId={projectId} managedSeasonId={seasonId} />;
}
