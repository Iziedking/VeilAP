import type { Metadata } from "next";

import { VeilArenaPlay } from "@/components/veil-arena-play";

export const metadata: Metadata = {
  title: "Play | Veil Arena",
  description: "Bring a deterministic poker agent package, seal its strategy, and enter a private competition.",
};

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string | string[];
    season?: string | string[];
    invite?: string | string[];
    agent?: string | string[];
  }>;
}) {
  const parameters = await searchParams;
  const queryProject = parameters.project;
  const projectId = (Array.isArray(queryProject) ? queryProject[0] : queryProject)?.trim()
    || process.env.NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID?.trim()
    || "";
  const querySeason = Array.isArray(parameters.season) ? parameters.season[0] : parameters.season;
  const invitationToken = Array.isArray(parameters.invite) ? parameters.invite[0] : parameters.invite;
  return (
    <VeilArenaPlay
      defaultAgentId={typeof parameters.agent === "string" ? parameters.agent : ""}
      defaultProjectId={projectId}
      defaultSeasonId={querySeason?.trim() ?? ""}
      invitationToken={invitationToken?.trim() ?? ""}
    />
  );
}
