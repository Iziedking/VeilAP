# Veil Arena architecture

## System goal

Veil Arena lets a player create a deterministic poker agent, enter a real season, and prove match results without publishing the strategy or private reward fields.

The design favors explicit trust boundaries, deterministic execution, durable state transitions, and wallet-owned authorization.

## Component map

| Component | Responsibility | Does not do |
| --- | --- | --- |
| Vercel browser app | Player builder, public arena, operator UI, wallet requests | Store server secrets or sign automatically |
| Next.js API on EC2 | Validate requests, authorize roles, encrypt data, persist state, reconcile chain evidence | Hold a wallet private key or broadcast silently |
| PostgreSQL 16 | Sessions, projects, artifacts, seasons, schedules, receipts, authorization records, audits | Store plaintext strategies or payout wallets |
| AWS KMS | Protect project data keys | Run matches or understand application records |
| Arena worker | Claim and execute one scheduled pairing at a time | Move funds |
| Starknet RPC | Verify wallet signatures, receipts, traces, and finality | Attest hidden STRK20 transfer fields |
| Player or sponsor wallet | Prove identity, prepare STRK20 proofs, sign, and broadcast | Give keys or viewing keys to Veil Arena |

## Player entry sequence

```text
Player -> public seasons API: list persisted seasons
Player -> builder: answer three strategy questions
Player -> wallet: sign one-time login challenge
API -> Starknet RPC: verify challenge signature
API -> PostgreSQL: persist revocable session
Player -> join API: submit constrained policy with idempotency key
API -> KMS: unwrap project data key
API -> PostgreSQL: store encrypted policy, payout wallet, and public commitment
API -> Player: return public entry proof only
```

An entry can be created only for a joinable season with a reward-ready application record. The same wallet owns the entry and its encrypted payout address.

## Match sequence

1. An authorized operator creates a season and registers or accepts entries.
2. Locking snapshots the ordered roster and creates every unique pairing in one database transaction.
3. The worker claims one pairing with a lease. Another worker cannot claim the same live lease.
4. The runner unwraps the project key, decrypts both policies and the seed, and executes duplicate deals with swapped seats.
5. Illegal or failed agent decisions fail closed according to the versioned engine rules.
6. The API persists the public receipt and signs its canonical form with Ed25519.
7. Leaderboard projections are derived from persisted receipts, not client state.

The worker uses stable idempotency keys. An expired lease can be reclaimed. A terminal record is not silently rewritten.

## Reward sequence

The application uses a sponsor-controlled reward plan, not an onchain escrow contract.

### Funding

1. The sponsor creates a season reward record with token and amount.
2. The API returns an exact `strk20_shield` plan whose recipient is the sponsor wallet.
3. The wallet prepares proofs, signs, and broadcasts.
4. The sponsor signs a five-minute Veil Arena authorization bound to the exact plan and transaction hash.
5. The API verifies sponsor identity, signature, plan digest, finality, direct pool interaction, replay protection, and expected state.
6. PostgreSQL atomically records the encrypted authorization, chain receipt digest, and funded state.

### Settlement

1. Every scheduled match must be complete.
2. The server derives one unique winner from persisted receipts.
3. The winner payout wallet is decrypted and checked against the entry owner fingerprint.
4. The sponsor receives an exact `strk20_transfer` plan.
5. The sponsor wallet signs and broadcasts, then signs the matching short-lived authorization.
6. The API repeats finality, pool, signature, replay, and state checks before marking settlement complete.

## Authorization model

Project roles are company, reviewer, contributor, and auditor. Service methods authorize each action against the durable project membership record. Public reads use separate response schemas.

Prize-pool management requires company authority and the original sponsor wallet. Worker execution requires both the internal worker secret and a configured company or reviewer wallet.

Wallet identity is normalized as a Starknet felt before comparison. Database joins use a keyed fingerprint so raw wallet addresses are not used as public identifiers.

## Data integrity

- Write endpoints use strict schemas and bounded request bodies.
- Creation and execution writes require idempotency keys.
- Public and private response types are separate.
- Audit records store event types and payload digests rather than sensitive request bodies.
- Transaction hashes are unique across reward operations.
- Unknown chain state remains retryable and is never promoted to success without finality.
- Reward confirmation and authorization persistence occur in one database transaction.

## Network boundary

The browser calls `https://api.veilap.xyz` with credentials. The API permits only the exact configured `VEILAP_APP_ORIGIN`, supports credentialed CORS, and returns no wildcard origin.

The API and database share a private Docker network. PostgreSQL has no host port. Caddy is the only public container. The systemd worker calls Caddy through VM loopback.

## Current limitations

- The trusted runner can read strategies during execution.
- The application reward record is not an onchain escrow.
- The chain cannot publicly prove hidden token, amount, and recipient fields.
- Version one accepts a constrained policy, not an arbitrary repository or live model endpoint.
- Confidential-compute attestation and zero-knowledge execution are future designs, not current claims.
