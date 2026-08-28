import { z } from "zod";

import { advisoryCriterionSchema, type ModelAdapter, type ModelAdapterResult } from "./types";

export const modelAdvisoryOutputSchema = z.object({
  summary: z.string().max(1_000),
  criteria: z.array(advisoryCriterionSchema).max(20),
}).strict();

export class NoopModelAdapter implements ModelAdapter {
  async assess(): Promise<ModelAdapterResult> {
    return { kind: "unavailable", reason: "ADVISORY_DISABLED" };
  }
}

export function createNoopModelAdapter(): ModelAdapter {
  return new NoopModelAdapter();
}
