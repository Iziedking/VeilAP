import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { AuthChallenge } from "@/server/auth/challenge";
import type { EncryptedField } from "@/server/crypto/envelope";
import type { VeilapDatabase } from "./client";
import { authNonces, authSessions, projects } from "./schema";

export interface AuthNonceRecord {
  nonce: string;
  walletFingerprint: string;
  challenge: AuthChallenge;
  digest: string;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface AuthNonceRepository {
  saveNonce(record: AuthNonceRecord): Promise<void>;
  getNonce(nonce: string): Promise<AuthNonceRecord | undefined>;
  consumeNonce(nonce: string, now: Date): Promise<AuthNonceRecord | "REPLAYED" | undefined>;
}

export interface SessionRecord {
  id: string;
  walletFingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface SessionRepository {
  saveSession(record: SessionRecord): Promise<void>;
  revokeSession(id: string, now: Date): Promise<void>;
}

export interface ProjectKeyRecord {
  id: string;
  name: string;
  ownerFingerprint: string;
  wrappedDataKey: string;
  createdAt: Date;
}

export interface ProjectKeyRepository {
  saveProject(record: ProjectKeyRecord): Promise<void>;
  getProject(id: string): Promise<ProjectKeyRecord | undefined>;
}

function toNonceRecord(row: typeof authNonces.$inferSelect): AuthNonceRecord {
  return {
    nonce: row.nonce,
    walletFingerprint: row.walletFingerprint,
    challenge: row.challenge as AuthChallenge,
    digest: row.digest,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined,
  };
}

export function createPostgresRepositories(db: VeilapDatabase): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectKeyRepository;
} {
  return {
    nonces: {
      async saveNonce(record) {
        await db.insert(authNonces).values({
          nonce: record.nonce,
          walletFingerprint: record.walletFingerprint,
          challenge: record.challenge,
          digest: record.digest,
          expiresAt: record.expiresAt,
          consumedAt: record.consumedAt,
        });
      },
      async getNonce(nonce) {
        const rows = await db.select().from(authNonces).where(eq(authNonces.nonce, nonce)).limit(1);
        return rows[0] ? toNonceRecord(rows[0]) : undefined;
      },
      async consumeNonce(nonce, now) {
        const rows = await db
          .update(authNonces)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authNonces.nonce, nonce),
              isNull(authNonces.consumedAt),
              gt(authNonces.expiresAt, now),
            ),
          )
          .returning();
        if (rows[0]) return toNonceRecord(rows[0]);
        const existing = await this.getNonce(nonce);
        return existing?.consumedAt ? "REPLAYED" : undefined;
      },
    },
    sessions: {
      async saveSession(record) {
        await db.insert(authSessions).values(record);
      },
      async revokeSession(id, now) {
        await db
          .update(authSessions)
          .set({ revokedAt: now })
          .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
      },
    },
    projects: {
      async saveProject(record) {
        await db.insert(projects).values(record);
      },
      async getProject(id) {
        const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        return rows[0];
      },
    },
  };
}

export function createMemoryRepositories(): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectKeyRepository;
} {
  const nonceRows = new Map<string, AuthNonceRecord>();
  const sessionRows = new Map<string, SessionRecord & { revokedAt?: Date }>();
  const projectRows = new Map<string, ProjectKeyRecord>();
  return {
    nonces: {
      async saveNonce(record) {
        if (nonceRows.has(record.nonce)) throw new Error("NONCE_ALREADY_EXISTS");
        nonceRows.set(record.nonce, structuredClone(record));
      },
      async getNonce(nonce) {
        const record = nonceRows.get(nonce);
        return record ? structuredClone(record) : undefined;
      },
      async consumeNonce(nonce, now) {
        const record = nonceRows.get(nonce);
        if (!record || record.expiresAt <= now) return undefined;
        if (record.consumedAt) return "REPLAYED";
        const consumed = { ...record, consumedAt: now };
        nonceRows.set(nonce, consumed);
        return structuredClone(consumed);
      },
    },
    sessions: {
      async saveSession(record) {
        if (sessionRows.has(record.id)) throw new Error("SESSION_ALREADY_EXISTS");
        sessionRows.set(record.id, structuredClone(record));
      },
      async revokeSession(id, now) {
        const record = sessionRows.get(id);
        if (record && !record.revokedAt) record.revokedAt = now;
      },
    },
    projects: {
      async saveProject(record) {
        if (projectRows.has(record.id)) throw new Error("PROJECT_ALREADY_EXISTS");
        projectRows.set(record.id, structuredClone(record));
      },
      async getProject(id) {
        const record = projectRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
    },
  };
}

export async function pingDatabase(db: VeilapDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

export type SensitiveRecord = EncryptedField;
