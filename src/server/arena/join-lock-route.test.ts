import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lock: vi.fn(), enroll: vi.fn() }));
vi.mock("@/server/auth/request-actor", () => ({ readRequestActor: async () => ({ ok: true, walletAddress: "0x1" }) }));
vi.mock("@/server/auth/runtime", () => ({ getSessionSecret: () => "test-secret".repeat(8) }));
vi.mock("@/server/env", () => ({ hasXOAuthConfig: () => true }));
vi.mock("@/server/identity/runtime", () => ({ walletFingerprint: () => "test-owner", getXIdentityRepository: () => ({ getByWalletFingerprint: async () => ({ username: "test" }) }) }));
vi.mock("@/server/projects/runtime", () => ({ getArenaEnrollmentService: () => ({ enroll: mocks.enroll }), getArenaSeasonService: () => ({ getPublicSchedule: async () => ({ ok: true, value: { season: { templateId: "champion_challenge", status: "open" }, entries: [{}, {}] } }), lockSeason: mocks.lock }) }));
import { POST } from "@/app/api/projects/[projectId]/seasons/[seasonId]/join/route";
it("reports saved enrollment but failed auto-lock instead of claiming a queued table", async () => {
  mocks.enroll.mockResolvedValue({ ok: true, value: { agentId: "TEST_BOT" } });
  mocks.lock.mockResolvedValue({ ok: false, code: "PERSISTENCE_FAILED" });
  const response = await POST(new Request("http://127.0.0.1/join", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "test-join-key" }, body: JSON.stringify({ agentId: "TEST_BOT", policy: {} }) }), { params: Promise.resolve({ projectId: "project", seasonId: "season" }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, code: "PERSISTENCE_FAILED", stage: "roster-lock", enrollment: "saved" });
});
