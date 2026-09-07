import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPool, getPublicSchedule, getProject, sealInvitation } = vi.hoisted(() => ({ getPool: vi.fn(), getPublicSchedule: vi.fn(), getProject: vi.fn(), sealInvitation: vi.fn() }));
vi.mock("@/server/auth/request-actor", () => ({ readRequestActor: async () => ({ ok: true, walletAddress: "0x1" }) }));
vi.mock("@/server/auth/runtime", () => ({ getSessionSecret: () => "test-only", expectedOrigin: () => "http://localhost:3010" }));
vi.mock("@/server/arena/arena-invitation-token", () => ({ sealArenaInvitation: sealInvitation }));
vi.mock("@/server/projects/runtime", () => ({
  getProjectService: () => ({ getProject }),
  getArenaPrizePoolService: () => ({ getPool }),
  getArenaSeasonService: () => ({ getPublicSchedule }),
}));
import { POST } from "./route";

const call = () => POST(new Request("http://localhost:3010/api/invitation", { method: "POST" }), { params: Promise.resolve({ projectId: "project", seasonId: "season" }) });
beforeEach(() => {
  vi.clearAllMocks();
  getProject.mockResolvedValue({ ok: true, value: { roles: ["company"] } });
  getPublicSchedule.mockResolvedValue({ ok: true, value: { season: { status: "open", entryMode: "invite_only", locksAt: "2099-01-01T00:00:00Z", rules: { rewardPolicy: "optional" } } } });
  getPool.mockResolvedValue({ ok: false, code: "ARENA_PRIZE_POOL_NOT_FOUND" });
  sealInvitation.mockReturnValue("test-invitation");
});
describe("private competition invitation gate", () => {
  it("allows a freepass private challenge without forcing funding", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).value.url).toContain("invite=test-invitation");
  });
  it.each(["funding_pending", "unknown", "settlement_pending"])("refuses sharing a configured %s reward", async (status) => {
    getPool.mockResolvedValue({ ok: true, value: { status } });
    expect((await (await call()).json()).code).toBe("ARENA_PRIZE_POOL_NOT_FUNDED");
    expect(sealInvitation).not.toHaveBeenCalled();
  });
  it("allows a funded private challenge", async () => {
    getPool.mockResolvedValue({ ok: true, value: { status: "funded" } });
    expect((await call()).status).toBe(200);
  });
  it("does not mistake a persistence failure for freepass", async () => {
    getPool.mockResolvedValue({ ok: false, code: "PERSISTENCE_FAILED" });
    expect((await (await call()).json()).code).toBe("PERSISTENCE_FAILED");
    expect(sealInvitation).not.toHaveBeenCalled();
  });
  it("does not issue invitations to non-operators", async () => {
    getProject.mockResolvedValue({ ok: true, value: { roles: ["contributor"] } });
    expect((await (await call()).json()).code).toBe("ROLE_FORBIDDEN");
    expect(sealInvitation).not.toHaveBeenCalled();
  });
});
