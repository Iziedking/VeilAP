import type { Metadata } from "next";

import { VeilArenaPlay } from "@/components/veil-arena-play";

export const metadata: Metadata = {
  title: "Play | Veil Arena",
  description: "Bring a deterministic poker agent package, seal its strategy, and enter a private competition.",
};

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const queryProject = (await searchParams).project;
  const projectId = (Array.isArray(queryProject) ? queryProject[0] : queryProject)?.trim()
    || process.env.NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID?.trim()
    || "";
  return (
    <VeilArenaPlay
      defaultProjectId={projectId}
    />
  );
}
