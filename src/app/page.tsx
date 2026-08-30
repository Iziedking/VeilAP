import { VeilArenaLanding } from "@/components/veil-arena-landing";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const queryProject = (await searchParams).project;
  const projectId = (Array.isArray(queryProject) ? queryProject[0] : queryProject)?.trim()
    || process.env.NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID?.trim()
    || "";
  return (
    <VeilArenaLanding
      defaultProjectId={projectId}
    />
  );
}
