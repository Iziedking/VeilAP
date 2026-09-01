import { eq } from "drizzle-orm";

import type { VeilapDatabase } from "@/server/db/client";
import { participantXIdentities } from "@/server/db/schema";

export type ParticipantXIdentity = Readonly<{
  xUserId: string;
  walletFingerprint: string;
  username: string;
  connectedAt: Date;
  lastVerifiedAt: Date;
}>;

export interface XIdentityRepository {
  getByWalletFingerprint(walletFingerprint: string): Promise<ParticipantXIdentity | undefined>;
  linkIdentity(record: ParticipantXIdentity): Promise<ParticipantXIdentity>;
}

function fromRow(row: typeof participantXIdentities.$inferSelect): ParticipantXIdentity {
  return {
    xUserId: row.xUserId,
    walletFingerprint: row.walletFingerprint,
    username: row.username,
    connectedAt: row.connectedAt,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

export function createPostgresXIdentityRepository(db: VeilapDatabase): XIdentityRepository {
  return {
    async getByWalletFingerprint(walletFingerprint) {
      const rows = await db.select().from(participantXIdentities)
        .where(eq(participantXIdentities.walletFingerprint, walletFingerprint)).limit(1);
      return rows[0] ? fromRow(rows[0]) : undefined;
    },
    async linkIdentity(record) {
      return db.transaction(async (tx) => {
        const walletRows = await tx.select().from(participantXIdentities)
          .where(eq(participantXIdentities.walletFingerprint, record.walletFingerprint)).limit(1);
        const xRows = await tx.select().from(participantXIdentities)
          .where(eq(participantXIdentities.xUserId, record.xUserId)).limit(1);
        const walletIdentity = walletRows[0];
        const xIdentity = xRows[0];
        if (walletIdentity && walletIdentity.xUserId !== record.xUserId) {
          throw new Error("X_WALLET_ALREADY_LINKED");
        }
        if (xIdentity && xIdentity.walletFingerprint !== record.walletFingerprint) {
          throw new Error("X_ACCOUNT_ALREADY_LINKED");
        }
        if (walletIdentity) {
          const rows = await tx.update(participantXIdentities).set({
            username: record.username,
            lastVerifiedAt: record.lastVerifiedAt,
          }).where(eq(participantXIdentities.xUserId, record.xUserId)).returning();
          return fromRow(rows[0]!);
        }
        const rows = await tx.insert(participantXIdentities)
          .values(record)
          .onConflictDoNothing()
          .returning();
        if (rows[0]) return fromRow(rows[0]);

        // A concurrent callback may have linked either unique identity after
        // the reads above. Resolve that race inside this transaction without
        // surfacing a database constraint error or weakening either binding.
        const concurrentWalletRows = await tx.select().from(participantXIdentities)
          .where(eq(participantXIdentities.walletFingerprint, record.walletFingerprint)).limit(1);
        const concurrentXRows = await tx.select().from(participantXIdentities)
          .where(eq(participantXIdentities.xUserId, record.xUserId)).limit(1);
        const concurrentWalletIdentity = concurrentWalletRows[0];
        const concurrentXIdentity = concurrentXRows[0];
        if (concurrentWalletIdentity && concurrentWalletIdentity.xUserId !== record.xUserId) {
          throw new Error("X_WALLET_ALREADY_LINKED");
        }
        if (concurrentXIdentity && concurrentXIdentity.walletFingerprint !== record.walletFingerprint) {
          throw new Error("X_ACCOUNT_ALREADY_LINKED");
        }
        if (concurrentWalletIdentity && concurrentXIdentity) {
          const updated = await tx.update(participantXIdentities).set({
            username: record.username,
            lastVerifiedAt: record.lastVerifiedAt,
          }).where(eq(participantXIdentities.xUserId, record.xUserId)).returning();
          return fromRow(updated[0]!);
        }
        throw new Error("X_IDENTITY_LINK_CONFLICT");
      });
    },
  };
}

export function createMemoryXIdentityRepository(): XIdentityRepository {
  const byXUserId = new Map<string, ParticipantXIdentity>();
  return {
    async getByWalletFingerprint(walletFingerprint) {
      const record = [...byXUserId.values()].find((value) => value.walletFingerprint === walletFingerprint);
      return record ? structuredClone(record) : undefined;
    },
    async linkIdentity(record) {
      const walletIdentity = [...byXUserId.values()].find((value) => value.walletFingerprint === record.walletFingerprint);
      const xIdentity = byXUserId.get(record.xUserId);
      if (walletIdentity && walletIdentity.xUserId !== record.xUserId) throw new Error("X_WALLET_ALREADY_LINKED");
      if (xIdentity && xIdentity.walletFingerprint !== record.walletFingerprint) throw new Error("X_ACCOUNT_ALREADY_LINKED");
      const next = walletIdentity
        ? { ...record, connectedAt: walletIdentity.connectedAt }
        : record;
      byXUserId.set(next.xUserId, structuredClone(next));
      return structuredClone(next);
    },
  };
}
