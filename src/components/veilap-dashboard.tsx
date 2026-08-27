"use client";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { useWorkspaceStore } from "@/features/workspace/workspace-store";

export function VeilApDashboard() {
  const workspace = useWorkspaceStore();
  return <WorkspaceShell workspace={workspace} />;
}
