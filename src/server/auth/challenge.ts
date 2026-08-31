import { randomBytes } from "node:crypto";

import { constants, type Signature, type TypedData, validateAndParseAddress } from "starknet";

import { commitment } from "@/domain/canonical";

const CHALLENGE_TTL_MS = 5 * 60_000;

export interface AuthTypedData extends TypedData {
  primaryType: "VeilArenaSession";
  message: {
    walletAddress: string;
    origin: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
  };
}

export interface AuthChallenge {
  nonce: string;
  walletAddress: string;
  origin: string;
  chainId: string;
  issuedAt: string;
  expiresAt: string;
  typedData: AuthTypedData;
}

export type ChallengeErrorCode =
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_REPLAYED"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_ALTERED"
  | "ORIGIN_MISMATCH"
  | "WALLET_MISMATCH"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_UNAVAILABLE";

type VerifySignature = (
  typedData: TypedData,
  signature: Signature,
  walletAddress: string,
) => Promise<boolean>;

interface ChallengeServiceOptions {
  now?: () => number;
  nonce?: () => string;
  persistence?: ChallengePersistence;
}

export interface ChallengePersistence {
  save(record: StoredChallenge): Promise<void>;
  get(nonce: string): Promise<StoredChallenge | undefined>;
  consume(nonce: string, now: Date): Promise<StoredChallenge | "REPLAYED" | undefined>;
}

function normalizeChainId(chainId: string): string {
  return chainId === "SN_MAIN" ? constants.StarknetChainId.SN_MAIN : chainId;
}

function normalizeOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (parsed.origin !== origin) throw new Error("AUTH_ORIGIN_INVALID");
  return parsed.origin;
}

function buildTypedData(challenge: Omit<AuthChallenge, "typedData">): AuthTypedData {
  return {
    domain: { name: "Veil Arena", chainId: challenge.chainId, version: "1" },
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "version", type: "felt" },
      ],
      VeilArenaSession: [
        { name: "walletAddress", type: "felt" },
        { name: "origin", type: "string" },
        { name: "nonce", type: "felt" },
        { name: "issuedAt", type: "string" },
        { name: "expiresAt", type: "string" },
      ],
    },
    primaryType: "VeilArenaSession",
    message: {
      walletAddress: challenge.walletAddress,
      origin: challenge.origin,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
    },
  };
}

export type StoredChallenge = { challenge: AuthChallenge; digest: string; consumedAt?: Date };

export function createAuthChallengeService(options: ChallengeServiceOptions = {}) {
  let clock = options.now ?? Date.now;
  // Starknet typed-data felts must fit below the field prime. 31 random bytes
  // stay below that boundary while preserving 248 bits of nonce entropy.
  const makeNonce = options.nonce ?? (() => `0x${randomBytes(31).toString("hex")}`);
  const persistence = options.persistence;
  const active = new Map<string, StoredChallenge>();
  const consumed = new Map<string, number>();

  function purgeExpired(now: number) {
    for (const [nonce, expiresAt] of consumed) {
      if (expiresAt < now) consumed.delete(nonce);
    }
  }

  function issue(input: { walletAddress: string; origin: string; chainId: string }): AuthChallenge {
    const now = clock();
    purgeExpired(now);
    const plain = {
      nonce: makeNonce(),
      walletAddress: validateAndParseAddress(input.walletAddress),
      origin: normalizeOrigin(input.origin),
      chainId: normalizeChainId(input.chainId),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString(),
    };
    const challenge: AuthChallenge = { ...plain, typedData: buildTypedData(plain) };
    active.set(challenge.nonce, { challenge, digest: commitment(challenge) });
    const copy = structuredClone(challenge);
    if (!persistence) return copy;
    return persistence.save({ challenge, digest: commitment(challenge) }).then(() => copy) as unknown as AuthChallenge;
  }

  return {
    issue,
    setClock(next: () => number) {
      clock = next;
    },
    async verify(input: {
      challenge: AuthChallenge;
      requestOrigin: string;
      walletAddress: string;
      signature: Signature;
      verifySignature: VerifySignature;
    }) {
      const now = clock();
      purgeExpired(now);
      const nonce = input.challenge.nonce;
      if (consumed.has(nonce)) {
        return { ok: false as const, code: "CHALLENGE_REPLAYED" as const };
      }
      const stored = persistence ? await persistence.get(nonce) : active.get(nonce);
      if (!stored) {
        return { ok: false as const, code: "CHALLENGE_NOT_FOUND" as const };
      }
      if (stored.consumedAt) {
        return { ok: false as const, code: "CHALLENGE_REPLAYED" as const };
      }
      if (normalizeOrigin(input.requestOrigin) !== stored.challenge.origin) {
        return { ok: false as const, code: "ORIGIN_MISMATCH" as const };
      }
      if (validateAndParseAddress(input.walletAddress) !== stored.challenge.walletAddress) {
        return { ok: false as const, code: "WALLET_MISMATCH" as const };
      }
      if (Date.parse(stored.challenge.expiresAt) <= now) {
        active.delete(nonce);
        return { ok: false as const, code: "CHALLENGE_EXPIRED" as const };
      }
      if (commitment(input.challenge) !== stored.digest) {
        return { ok: false as const, code: "CHALLENGE_ALTERED" as const };
      }

      try {
        const valid = await input.verifySignature(
          stored.challenge.typedData,
          input.signature,
          stored.challenge.walletAddress,
        );
        if (!valid) {
          return { ok: false as const, code: "SIGNATURE_INVALID" as const };
        }
      } catch {
        return { ok: false as const, code: "SIGNATURE_UNAVAILABLE" as const };
      }
      if (persistence) {
        const consumedRecord = await persistence.consume(nonce, new Date(now));
        if (consumedRecord === "REPLAYED") {
          return { ok: false as const, code: "CHALLENGE_REPLAYED" as const };
        }
        if (!consumedRecord) {
          return { ok: false as const, code: "CHALLENGE_NOT_FOUND" as const };
        }
      } else {
        if (!active.has(nonce)) {
          return { ok: false as const, code: "CHALLENGE_REPLAYED" as const };
        }
        active.delete(nonce);
        consumed.set(nonce, Date.parse(stored.challenge.expiresAt));
      }
      return { ok: true as const, walletAddress: stored.challenge.walletAddress };
    },
  };
}
