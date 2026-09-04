import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "@/server/db/repositories";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { ProjectService } from "@/server/projects/project-service";
import { ArenaSeasonService } from "@/server/arena/arena-season-service";
import { ArenaEnrollmentService } from "@/server/arena/arena-enrollment-service";
import { ArenaMatchService } from "@/server/arena/arena-match-service";
const mocks = vi.hoisted(() => ({ project: vi.fn(), season: vi.fn(), enrollment: vi.fn(), actor: vi.fn() }));
vi.mock("@/server/projects/runtime", () => ({ getProjectService: mocks.project, getArenaSeasonService: mocks.season, getArenaEnrollmentService: mocks.enrollment }));
vi.mock("@/server/auth/request-actor", () => ({ readRequestActor: mocks.actor }));
vi.mock("@/server/auth/runtime", () => ({ getSessionSecret: () => "test-secret".repeat(8), expectedOrigin: () => "http://127.0.0.1:3010" }));
import { POST } from "@/app/api/champion/challenges/route";
let repositories: ReturnType<typeof createMemoryRepositories>;
beforeEach(() => {
  repositories = createMemoryRepositories();
  const dependencies = { repositories: repositories.projects, keyProvider: createPreviewKeyProvider(), walletHashPepper: "test-pepper".repeat(8) };
  mocks.project.mockReturnValue(new ProjectService(dependencies));
  mocks.season.mockReturnValue(new ArenaSeasonService({ ...dependencies, matchService: new ArenaMatchService(dependencies) }));
  mocks.enrollment.mockReturnValue(new ArenaEnrollmentService(dependencies));
  mocks.actor.mockResolvedValue({ ok: true, walletAddress: "0x1" });
});
describe("challenge request idempotency", () => {
  it("retries after concurrent creation without a second project or season", async () => {
    const request = () => new Request("http://127.0.0.1:3010/api/champion/challenges", { method: "POST", headers: { "idempotency-key": "stable-challenge-key" } });
    await Promise.all([POST(request()), POST(request())]);
    const first = await (await POST(request())).json();
    const retry = await (await POST(request())).json();
    expect(first.ok).toBe(true);
    expect(retry.value.projectId).toBe(first.value.projectId);
    expect(retry.value.seasonId).toBe(first.value.seasonId);
    expect(await repositories.projects.listAllArenaSeasons()).toHaveLength(1);
    expect(await repositories.projects.listArenaSeasonEntries(first.value.projectId, first.value.seasonId)).toHaveLength(1);
  });
  it("refuses missing idempotency identity before creating anything", async () => {
    const response = await POST(new Request("http://127.0.0.1:3010/api/champion/challenges", { method: "POST" }));
    expect(response.status).toBe(400);
    expect(await repositories.projects.listAllArenaSeasons()).toHaveLength(0);
  });
});
