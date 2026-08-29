import type {
  CheckpointRecord,
  ProjectRepository,
  ProjectRole,
} from "@/server/db/repositories";

export type AuthorizationAction =
  | "read_project"
  | "invite_member"
  | "create_agreement"
  | "submit_strategy"
  | "submit_checkpoint"
  | "read_checkpoint";

export type AuthorizationErrorCode =
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "CHECKPOINT_NOT_ASSIGNED"
  | "EVIDENCE_FORBIDDEN";

export type AuthorizationResult =
  | { ok: true; roles: ProjectRole[]; canReadEvidence: boolean }
  | { ok: false; code: AuthorizationErrorCode };

const rolePriority: ProjectRole[] = ["company", "reviewer", "contributor", "auditor"];

function hasRole(roles: readonly ProjectRole[], role: ProjectRole): boolean {
  return roles.includes(role);
}

function orderedRoles(roles: ProjectRole[]): ProjectRole[] {
  return rolePriority.filter((role) => roles.includes(role));
}

export async function authorizeProject(
  repositories: Pick<ProjectRepository, "getMemberRoles">,
  input: {
    projectId: string;
    walletFingerprint: string;
    action: Exclude<AuthorizationAction, "read_checkpoint">;
  },
): Promise<AuthorizationResult> {
  const roles = orderedRoles(await repositories.getMemberRoles(input.projectId, input.walletFingerprint));
  if (roles.length === 0) return { ok: false, code: "PROJECT_ACCESS_REQUIRED" };

  const allowed = input.action === "read_project"
    || (input.action === "invite_member" && hasRole(roles, "company"))
    || (input.action === "create_agreement" && hasRole(roles, "company"))
    || (input.action === "submit_strategy" && hasRole(roles, "contributor"))
    || (input.action === "submit_checkpoint" && hasRole(roles, "contributor"));

  if (!allowed) return { ok: false, code: "ROLE_FORBIDDEN" };
  return {
    ok: true,
    roles,
    canReadEvidence: hasRole(roles, "company"),
  };
}

export async function authorizeCheckpoint(
  repositories: Pick<ProjectRepository, "getMemberRoles">,
  input: {
    checkpoint: CheckpointRecord;
    walletFingerprint: string;
  },
): Promise<AuthorizationResult> {
  const roles = orderedRoles(
    await repositories.getMemberRoles(input.checkpoint.projectId, input.walletFingerprint),
  );
  if (roles.length === 0) return { ok: false, code: "PROJECT_ACCESS_REQUIRED" };

  if (hasRole(roles, "company")) {
    return { ok: true, roles, canReadEvidence: true };
  }
  if (hasRole(roles, "reviewer")) {
    if (input.checkpoint.assignedReviewerFingerprint !== input.walletFingerprint) {
      return { ok: false, code: "CHECKPOINT_NOT_ASSIGNED" };
    }
    return { ok: true, roles, canReadEvidence: true };
  }
  if (hasRole(roles, "contributor") && input.checkpoint.createdBy === input.walletFingerprint) {
    return { ok: true, roles, canReadEvidence: true };
  }
  if (hasRole(roles, "auditor")) {
    return { ok: true, roles, canReadEvidence: false };
  }
  return { ok: false, code: "EVIDENCE_FORBIDDEN" };
}
