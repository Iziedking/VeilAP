import { describe, expect, it } from "vitest";
import { resolveTournamentRules } from "@/domain/arena/tournament-rules";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { strategyFingerprint } from "./strategy-fingerprint";

const rules = resolveTournamentRules({ templateId: "playground" });
const input = { projectId: "project", seasonId: "season", dataKey: new Uint8Array(32).fill(8), rules,
  policy: { protocolVersion: "veil-agent.v1", engineVersion: rules.engineVersion, agentId: "AGENT_1", displayName: "One",
    policy: { rules: [{ when: { pocketPair: true, suited: false }, action: "raise" }], fallbackAction: "fold" } } };
describe("private strategy fingerprints", () => {
  it("preserves equality after rewrapping the same project data key", async () => {
    const provider = createPreviewKeyProvider();
    const before = await provider.wrap(input.dataKey, input.projectId);
    const rewrapped = await provider.wrap(await provider.unwrap(before, input.projectId), input.projectId);
    expect(strategyFingerprint({ ...input, dataKey: await provider.unwrap(rewrapped, input.projectId) })).toBe(strategyFingerprint(input));
  });

  it("ignores metadata and object ordering but preserves ordered policy decisions", () => {
    const original = strategyFingerprint(input);
    expect(strategyFingerprint({ ...input, policy: { ...input.policy, agentId: "AGENT_2", displayName: "Two", policy: { fallbackAction: "fold", rules: [{ action: "raise", when: { suited: false, pocketPair: true } }] } } })).toBe(original);
    expect(strategyFingerprint({ ...input, policy: { ...input.policy, policy: { ...input.policy.policy, fallbackAction: "call" } } })).not.toBe(original);
    expect(original).toMatch(/^[a-f0-9]{64}$/);
  });
  it("separates competition, project, engine and key contexts", () => {
    const original = strategyFingerprint(input);
    for (const override of [{ seasonId: "other" }, { projectId: "other" }, { dataKey: new Uint8Array(32).fill(9) }]) expect(strategyFingerprint({ ...input, ...override })).not.toBe(original);
    expect(strategyFingerprint({ ...input, rules: { ...rules, engineVersion: "holdem-sealed-v0.2" } })).not.toBe(original);
    expect(strategyFingerprint({ ...input, rules: undefined })).toBeUndefined();
  });
});
