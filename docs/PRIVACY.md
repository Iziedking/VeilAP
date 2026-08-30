# Veil Arena privacy and threat boundary

Last reviewed against the implemented source on 30 August 2026.

## Privacy model

Veil Arena uses two separate privacy systems.

Application encryption protects strategy policies, private match inputs, payout wallets, and transfer authorizations in storage. STRK20 protects private in-pool transfers from public chain observers. STRK20 does not encrypt agent files, prompts, or database records.

## Data classification

| Data | Public | Stored encrypted | Trusted runner can read |
| --- | --- | --- | --- |
| Agent alias and identifier | Yes | No | Yes |
| Artifact commitment | Yes | No | Yes |
| Strategy policy | No | Yes | Yes, during authorized execution |
| Builder wallet address | No | Fingerprint plus encrypted payout address | Authorized application services only |
| Match seed | Commitment only | Yes | Yes, during execution and replay |
| Full transcript | Root and selected leaf only | Reproducible from encrypted inputs | Yes |
| Score, rank, and receipt | Yes | No | Yes |
| Losing selective reveal | One authorized action | Public after reveal | Yes |
| Funding or payout plan | No | Authorization is encrypted | Sponsor and authorized application services |
| Public settlement receipt | Winner agent and digests | No | Yes |
| Private transfer recipient and amount | No | Recipient encrypted; amount held in private operator record | Sponsor and authorized application services |

## Strategy protection

The player builder creates a constrained, versioned deterministic policy. The server validates it, computes an artifact commitment, encrypts the policy with a project data key, and stores only the encrypted artifact plus public metadata.

The project data key is wrapped by AWS KMS. The EC2 application role can request KMS encrypt and decrypt operations for the configured key. Database access alone does not expose plaintext strategy data.

The trusted runner unwraps the project key and decrypts both policies for an authorized scheduled match. The runner can therefore observe the policy and full transcript. A host administrator with sufficient application and KMS access is also inside this boundary.

Version one is private from competitors and public APIs. It is not operator-blind, end-to-end encrypted, zero knowledge, or confidential-compute attested.

## Wallet privacy

Wallet sign-in uses a one-time typed-data challenge bound to `SN_MAIN`, the expected browser origin, the wallet, and an expiry. The API verifies the signature through the configured Starknet RPC. A consumed nonce cannot be replayed.

The session cookie is HTTP-only, secure in production, host-only, and SameSite Strict. The database stores a keyed wallet fingerprint for authorization joins. Payout addresses are encrypted under the project data key.

Veil Arena never asks for, receives, or stores a wallet private key or STRK20 viewing key.

## Match evidence and selective disclosure

A public match receipt binds the participating artifact commitments, engine version, seed commitment, score, hand commitments, and transcript root. New receipts are signed with the configured Ed25519 receipt key.

An authorized reveal replays the deterministic match and publishes one losing action with its inclusion path. The verifier can check that the leaf belongs to the committed transcript. The complete policy, private cards, full transcript, and winning strategy remain absent from the public response.

Repeated reveal policy is an operator responsibility. A season should disclose only the minimum evidence required for accountability.

## Reward privacy and proof boundary

Funding is a sponsor shield operation into the sponsor's own STRK20 private balance. Settlement is a private STRK20 transfer from that sponsor to the encrypted winner wallet.

Before either confirmation is accepted, the sponsor signs a five-minute typed authorization that binds:

- operation;
- project, season, and application pool record;
- STRK20 pool and token;
- amount and recipient;
- plan digest and transaction hash;
- issue and expiry time.

The API verifies the signature against the original sponsor wallet, rejects altered or expired plans, prevents transaction-hash reuse, checks Starknet finality, and requires the trace to touch the configured STRK20 pool. The authorization is encrypted before persistence.

The chain does not reveal enough private transfer detail for the application to prove the hidden token, amount, and recipient from public events. The sponsor signature attests those hidden fields. The chain evidence proves finality and pool interaction. The application record is not an onchain escrow and does not prove sponsor solvency.

Public settlement responses omit the recipient, amount, token, pool address, transaction hash, sponsor identity, and encrypted authorization.

## Observable information

Privacy does not remove all metadata. Observers may still learn:

- when the STRK20 pool was called;
- public deposit or withdrawal edges;
- network timing and transaction behavior;
- that a particular season or match exists;
- aliases, commitments, scores, and signed receipts;
- information disclosed by a player or operator outside Veil Arena;
- data available to systems inside the declared trusted boundary.

Small anonymity sets and distinctive timing can weaken practical privacy.

## Threats and controls

| Threat | Current control | Residual risk |
| --- | --- | --- |
| Competitor reads a policy | Public schemas exclude policy; encrypted persistence | Trusted operators can still read during execution |
| Database theft | Envelope encryption and KMS-wrapped project keys | Application and KMS compromise can expose data |
| Wallet impersonation | One-time typed challenge, RPC verification, durable session revocation | Compromised wallet or browser remains authoritative |
| Cross-origin session abuse | Exact origin checks, strict CORS, SameSite cookie | Misconfigured production origins can break or weaken access |
| Duplicate match execution | Database lease, idempotency key, terminal state checks | Database outage can delay reconciliation |
| Fake reward confirmation | Sponsor signature, exact plan binding, finality, pool trace, replay guard | No contract-enforced escrow or public proof of hidden fields |
| Strategy reconstruction | Minimal selective reveal and no full transcript endpoint | Too many operator-approved reveals can leak behavior |
| Sensitive log leakage | Public error mapping and digest-based audit records | Operators must keep request-body logging disabled |

## Claims Veil Arena does not make

Do not describe version one as fully anonymous, untraceable, trustless, private forever, operator-blind, zero knowledge, or end-to-end encrypted.

The precise claim is: competitors and public APIs receive verifiable competition results without receiving submitted strategy policies or private reward fields. Authorized infrastructure can decrypt the minimum data required to run and settle the competition.
