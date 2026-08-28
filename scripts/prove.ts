import { buildProofReport } from "../src/domain/proof-report";

const report = buildProofReport();
const repeatedReport = buildProofReport();
const serialized = JSON.stringify(report);
if (serialized !== JSON.stringify(repeatedReport)) {
  throw new Error("PROOF_REPORT_NOT_DETERMINISTIC");
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
