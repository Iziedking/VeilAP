# Veil Arena architecture

## System goal

Veil Arena lets anyone direct a coding agent to create a deterministic poker package, approve that package with a wallet-authenticated session, enter a real competition, and prove match results without publishing the strategy or private reward fields.

The design favors explicit trust boundaries, deterministic execution, durable state transitions, and wallet-owned authorization.

## Component map

| Component | Responsibility | Does not do |
| --- | --- | --- |
| Vercel browser app | Agent guide, package review, public arena, operator UI, wallet requests | Store server secrets or sign automatically |
| Next.js API on EC2 | Validate requests, authorize roles, encrypt data, persist state, reconcile chain evidence | Hold a wallet private key or broadcast silently |
| PostgreSQL 16 | Sessions, projects, artifacts, seasons, schedules, receipts, authorization records, audits | Store plaintext strategies or payout wallets |
| AWS KMS | Protect project data keys | Run matches or understand application records |
| Arena worker | Claim and execute one scheduled pairing at a time | Move funds |
| Starknet RPC | Verify wallet signatures, receipts, traces, and finality | Attest hidden STRK20 transfer fields |
| Player or sponsor wallet | Prove identity, prepare STRK20 proofs, sign, and broadcast | Give keys or viewing keys to Veil Arena |

## Player entry sequence

```text
Coding agent -> agent submissions API: discover persisted open competitions
Coding agent -> protocol: build and validate one strict deterministic package
Coding agent -> agent submissions API: exchange package for encrypted approval link
Player -> approval link: review package identity and commitment
Player -> wallet: sign one-time login challenge
API -> Starknet RPC: verify challenge signature
API -> PostgreSQL: persist revocable session
Player -> join API: approve the reviewed package with an idempotency key
API -> KMS: unwrap project data key
API -> PostgreSQL: store encrypted policy, payout wallet, and public commitment
API -> Player: return public entry proof only
```

The coding-agent endpoint cannot create an entry. It returns a 24-hour authenticated encrypted link whose fragment is opened by the player interface. The player must still establish a wallet-verified session and approve the package.

An entry can be created for any public, open, joinable competition. A private competition requires a valid encrypted invitation bound to that project, season, and expiry time. Reward funding is a separate lifecycle. A player wallet owns its entry and encrypted payout address.

The Veil Arena Champion is a system-owned deterministic package. It is validated, encrypted, committed, enrolled, scheduled, and executed through the same path as a player package, but it has no player owner or payout wallet. A Champion challenge creates one private two-seat season, enrolls the benchmark, and issues the signed-in challenger a one-competition invitation. The roster locks automatically after the player's real package occupies the second seat.

If the season's immutable rules snapshot permits replacement, the same wallet may approve a stronger package before roster lock. The replacement transaction validates the new package, stores a new encrypted artifact, retires the prior active projection, advances the stable entry to the next version, and appends a digest-only audit event atomically. A failure rolls back the whole transaction. The retired artifact is never overwritten or exposed.

## Tournament rules and scheduling

The operator chooses an audited template or composes a custom format from approved primitives. The resolved rules are stored on the season with a canonical commitment. They do not change after creation.

The current engine supports deterministic round robin, repeated duel series, and benchmark gauntlet schedules. Every generated encounter uses duplicate deals and seat swaps. The scheduler computes the exact match and hand workload before lock. Championship templates require a verified funded reward record before the roster can lock; exhibition and pledged formats can run without liquidity.

## Match sequence

1. An authorized operator creates a season from a versioned rules template and accepts entries according to that snapshot.
2. Locking snapshots the ordered active agent versions and creates the template's complete schedule in one database transaction.
3. The worker claims one pairing with a lease. Another worker cannot claim the same live lease.
4. The runner unwraps the project key, decrypts both policies and the seed, and executes duplicate deals with swapped seats.
5. Illegal or failed agent decisions fail closed according to the versioned engine rules.
6. The API persists the public receipt and signs its canonical form with Ed25519.
7. Each duplicate deal also persists a public hand receipt containing commitments, the seat-swap flag, and the hand winner. It contains no cards, actions, policy, reasoning, or raw seed.
8. Leaderboard projections and the dedicated match replay are derived from persisted receipts, not client state.

The match page polls while a worker owns the pairing lease. The current runner completes a match before its signed receipt is published, so the public hand sequence is presented as a verified replay rather than invented live actions.

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
- Version one accepts a strict, expressive `veil-agent.v1` package, not arbitrary executable code, a repository, or a live model endpoint.
- Confidential-compute attestation and zero-knowledge execution are future designs, not current claims.
