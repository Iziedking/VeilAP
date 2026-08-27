import type { WorkspaceState } from "@/features/workspace/workspace-store";

export function ProofTimeline({ workspace }: { workspace: WorkspaceState }) {
  const invalidCount = workspace.project.checkpoints.filter(
    (checkpoint) => checkpoint.displayStatus === "invalid",
  ).length;

  return (
    <section className="proof-summary" aria-label="Proof stream summary">
      <span>PROOF CONTROL</span>
      <strong>One refusal. One reviewable checkpoint.</strong>
      <p>
        {invalidCount} artifact was stopped before human review. The current checkpoint remains tied to agreement version {workspace.project.agreementVersion}.
      </p>
    </section>
  );
}
