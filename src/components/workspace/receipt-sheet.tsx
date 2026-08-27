import type { WorkspaceState } from "@/features/workspace/workspace-store";

export function ReceiptSheet({ workspace }: { workspace: WorkspaceState }) {
  return (
    <footer id="receipt" className="document-footer">
      <span>VEILAP / ATTESTED PAYMENTS</span>
      <span>{workspace.release ? "RELEASE INTENT / PREPARED" : "RECEIPT / NOT ISSUED"}</span>
      <span>PREVIEW / SYNTHETIC RECORD</span>
    </footer>
  );
}
