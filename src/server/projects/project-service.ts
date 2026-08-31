import { randomUUID } from "node:crypto";
import { z } from "zod";

import { commitment } from "@/domain/canonical";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import { createProjectKeyMaterial, type KeyProvider } from "@/server/crypto/key-provider";
import type {
  AgreementVersionRecord,
  ProjectRepository,
  ProjectRole,
} from "@/server/db/repositories";
import { authorizeProject } from "@/server/authorization/authorize";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

export const agreementTermsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  acceptanceCriteria: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(1_000),
  }).strict()).min(1).max(50),
  milestoneMinor: z.string().regex(/^[0-9]+$/).refine((value) => value !== "0", "MILESTONE_AMOUNT_INVALID"),
  royaltyBps: z.number().int().min(0).max(10_000),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export type AgreementTerms = z.infer<typeof agreementTermsSchema>;

export type ProjectServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "AGREEMENT_NOT_FOUND"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type ProjectServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProjectServiceErrorCode };

export interface ProjectServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  systemWorkerWalletAddress?: string;
  now?: () => Date;
  idFactory?: () => string;
}

export interface ProjectView {
  id: string;
  name: string;
  createdAt: string;
  roles: ProjectRole[];
}

export interface AgreementView {
  id: string;
  projectId: string;
  version: number;
  termsDigest: string;
  createdAt: string;
  terms?: AgreementTerms;
}

function actorFingerprint(walletAddress: string, pepper: string): string {
  return fingerprintWallet(walletAddress, pepper);
}

function errorCode(error: unknown): ProjectServiceErrorCode {
  if (error instanceof Error && error.message === "PROJECT_ACCESS_REQUIRED") {
    return "PROJECT_ACCESS_REQUIRED";
  }
  if (error instanceof Error && error.message === "ROLE_FORBIDDEN") return "ROLE_FORBIDDEN";
  if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return "PROJECT_NOT_FOUND";
  return "PERSISTENCE_FAILED";
}

function mapAuthorizationCode(code: string): ProjectServiceErrorCode {
  if (code === "PROJECT_ACCESS_REQUIRED") return "PROJECT_ACCESS_REQUIRED";
  return "ROLE_FORBIDDEN";
}

export class ProjectService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly systemWorkerWalletAddress?: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: ProjectServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.systemWorkerWalletAddress = dependencies.systemWorkerWalletAddress?.trim() || undefined;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async createProject(input: {
    name: string;
    walletAddress: string;
  }): Promise<ProjectServiceResult<ProjectView>> {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 120) return { ok: false, code: "INVALID_INPUT" };

    try {
      const ownerFingerprint = actorFingerprint(input.walletAddress, this.walletHashPepper);
      const id = this.idFactory();
      const createdAt = this.now();
      const keyMaterial = await createProjectKeyMaterial(this.keyProvider, id);
      await this.repositories.saveProject({
        id,
        name,
        ownerFingerprint,
        wrappedDataKey: keyMaterial.wrappedKey,
        createdAt,
      });
      await this.repositories.saveMember({
        projectId: id,
        walletFingerprint: ownerFingerprint,
        role: "company",
        createdAt,
      });
      if (this.systemWorkerWalletAddress) {
        const workerFingerprint = actorFingerprint(this.systemWorkerWalletAddress, this.walletHashPepper);
        if (workerFingerprint !== ownerFingerprint) {
          await this.repositories.saveMember({
            projectId: id,
            walletFingerprint: workerFingerprint,
            role: "reviewer",
            createdAt,
          });
        }
      }
      await this.writeAudit(id, ownerFingerprint, "project_created", commitment({ projectId: id, nameDigest: commitment(name) }));
      return {
        ok: true,
        value: { id, name, createdAt: createdAt.toISOString(), roles: ["company"] },
      };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  async getProject(input: {
    projectId: string;
    walletAddress: string;
  }): Promise<ProjectServiceResult<ProjectView>> {
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const walletFingerprint = actorFingerprint(input.walletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint,
        action: "read_project",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      return {
        ok: true,
        value: {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt.toISOString(),
          roles: authorized.roles,
        },
      };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  async inviteMember(input: {
    projectId: string;
    actorWalletAddress: string;
    walletAddress: string;
    role: Exclude<ProjectRole, "company">;
  }): Promise<ProjectServiceResult<{ projectId: string; role: Exclude<ProjectRole, "company"> }>> {
    try {
      if (!(await this.repositories.getProject(input.projectId))) {
        return { ok: false, code: "PROJECT_NOT_FOUND" };
      }
      const actorFingerprintValue = actorFingerprint(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint: actorFingerprintValue,
        action: "invite_member",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      const invitedFingerprint = actorFingerprint(input.walletAddress, this.walletHashPepper);
      await this.repositories.saveMember({
        projectId: input.projectId,
        walletFingerprint: invitedFingerprint,
        role: input.role,
        createdAt: this.now(),
      });
      await this.writeAudit(
        input.projectId,
        actorFingerprintValue,
        "member_invited",
        commitment({ projectId: input.projectId, role: input.role, memberFingerprint: invitedFingerprint }),
      );
      return { ok: true, value: { projectId: input.projectId, role: input.role } };
    } catch (error) {
      const code = errorCode(error);
      return { ok: false, code };
    }
  }

  async createAgreement(input: {
    projectId: string;
    actorWalletAddress: string;
    terms: AgreementTerms;
  }): Promise<ProjectServiceResult<AgreementView>> {
    const parsed = agreementTermsSchema.safeParse(input.terms);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const createdBy = actorFingerprint(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint: createdBy,
        action: "create_agreement",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const existing = await this.repositories.listAgreements(input.projectId);
      const version = (existing.at(-1)?.version ?? 0) + 1;
      const id = this.idFactory();
      const createdAt = this.now();
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const termsDigest = commitment(parsed.data);
      const encryptedTerms = encryptField(
        JSON.stringify(parsed.data),
        { projectId: input.projectId, recordType: "agreement", recordId: id, fieldName: "terms" },
        dataKey,
      );
      const record: AgreementVersionRecord = {
        id,
        projectId: input.projectId,
        version,
        encryptedTerms,
        termsDigest,
        createdBy,
        createdAt,
      };
      await this.repositories.saveAgreement(record);
      await this.writeAudit(input.projectId, createdBy, "agreement_version_created", commitment({ agreementId: id, termsDigest, version }));
      return { ok: true, value: this.agreementView(record, parsed.data) };
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  async listAgreements(input: {
    projectId: string;
    walletAddress: string;
  }): Promise<ProjectServiceResult<AgreementView[]>> {
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const walletFingerprint = actorFingerprint(input.walletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint,
        action: "read_project",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      const records = await this.repositories.listAgreements(input.projectId);
      if (authorized.roles.includes("auditor")) {
        return { ok: true, value: records.map((record) => this.agreementView(record)) };
      }
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      return {
        ok: true,
        value: records.map((record) => {
          const terms = JSON.parse(decryptField(
            record.encryptedTerms,
            { projectId: input.projectId, recordType: "agreement", recordId: record.id, fieldName: "terms" },
            dataKey,
          )) as AgreementTerms;
          return this.agreementView(record, terms);
        }),
      };
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  private agreementView(record: AgreementVersionRecord, terms?: AgreementTerms): AgreementView {
    return {
      id: record.id,
      projectId: record.projectId,
      version: record.version,
      termsDigest: record.termsDigest,
      createdAt: record.createdAt.toISOString(),
      ...(terms ? { terms } : {}),
    };
  }

  private async writeAudit(
    projectId: string,
    actorFingerprintValue: string,
    eventType: string,
    payloadDigest: string,
  ): Promise<void> {
    await this.repositories.saveAuditEvent({
      id: this.idFactory(),
      projectId,
      actorFingerprint: actorFingerprintValue,
      eventType,
      payloadDigest,
      createdAt: this.now(),
    });
  }
}
