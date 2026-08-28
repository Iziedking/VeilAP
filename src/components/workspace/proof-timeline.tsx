import type { WorkspaceState } from "@/features/workspace/workspace-store";

export function ProofTimeline({ workspace }: { workspace: WorkspaceState }) {
  const invalidCount = workspace.project.checkpoints.filter(
    (checkpoint) => checkpoint.displayStatus === "invalid",
  ).length;
  const reviewableCount = workspace.project.checkpoints.filter(
    (checkpoint) => checkpoint.displayStatus === "ready_for_review",
  ).length;

  return (
    <section className="proof-summary" aria-label="Proof stream summary">
      <span>PROOF CONTROL / DETERMINISTIC FIRST</span>
      <strong>{invalidCount} refusal. {reviewableCount} reviewable checkpoint.</strong>
      <p>
        Evidence is checked against its recorded digest and agreement version before any advisory assessment or payment action. The current checkpoint remains tied to agreement version {workspace.project.agreementVersion}.
      </p>
    </section>
  );
}
