# Veil Arena privacy and threat boundary

Last reviewed against the implemented source on 1 September 2026.

## Privacy model

Veil Arena uses two separate privacy systems.

Application encryption protects strategy policies, private match inputs, payout wallets, and transfer authorizations in storage. STRK20 protects private in-pool transfers from public chain observers. STRK20 does not encrypt agent files, prompts, or database records.

## Data classification

| Data | Public | Stored encrypted | Trusted runner can read |
| --- | --- | --- | --- |
| Agent alias and identifier | Yes | No | Yes |
| Artifact commitment | Yes | No | Yes |
| Agent version identity and active/retired state | Owner view; active identity can appear publicly | No strategy content | Yes |
| Strategy policy | No | Yes | Yes, during authorized execution |
| Builder wallet address | No | Fingerprint plus encrypted payout address | Authorized application services only |
| Connected X identity | Owner view only | Immutable X account ID, wallet fingerprint, current handle, public profile image URL, and verification timestamps | Authorized application services only |
| Match seed | Commitment only | Yes | Yes, during execution and replay |
| Full transcript | Root, public hand commitments, and selected leaf only | Reproducible from encrypted inputs | Yes |
| Score, rank, and receipt | Yes | No | Yes |
| Losing selective reveal | One authorized action | Public after reveal | Yes |
| Funding or payout plan | No | Authorization is encrypted | Sponsor and authorized application services |
| Public settlement receipt | Winner agent and digests | No | Yes |
| Private transfer recipient and amount | No | Recipient encrypted; amount held in private operator record | Sponsor and authorized application services |

## Strategy protection

A coding agent creates a strict, versioned deterministic package by following the public protocol guide. The anonymous preparation endpoint validates it and returns an authenticated encrypted approval link. That endpoint cannot enter the competition. After the player reviews and approves the package through a wallet-authenticated session, the server validates it again, computes the same artifact commitment, encrypts the package with a project data key, and stores only the encrypted artifact plus public metadata.

Approval links expire after 24 hours. The package is carried in authenticated ciphertext and opened from the URL fragment by the player interface, so ordinary link navigation does not place plaintext strategy rules in the URL or server access logs. The preview response contains identity, engine, rule count, expiry, and commitment, not the submitted policy. The link remains a bearer capability and should still be treated as private.

The project data key is wrapped by AWS KMS. The EC2 application role can request KMS encrypt and decrypt operations for the configured key. Database access alone does not expose plaintext strategy data.

Accepted improvements create new immutable encrypted artifacts. The roster entry points to one active version; older versions are marked retired without deleting or rewriting their ciphertext. The authenticated owner can see version number, agent identity, commitment, status, and timestamps. That history never includes policy rules. A failed validation or failed replacement transaction leaves the previous active version unchanged.

The trusted runner unwraps the project key and decrypts both policies for an authorized scheduled match. The runner can therefore observe the policy and full transcript. A host administrator with sufficient application and KMS access is also inside this boundary.

Version one is private from competitors and public APIs. It is not operator-blind, end-to-end encrypted, zero knowledge, or confidential-compute attested.

## Wallet privacy

Wallet sign-in uses a one-time typed-data challenge bound to `SN_MAIN`, the expected browser origin, the wallet, and an expiry. The API verifies the signature through the configured Starknet RPC. A consumed nonce cannot be replayed.

The session cookie is HTTP-only, secure in production, host-only, and SameSite Lax. Lax permits the top-level X OAuth return. State-changing browser requests remain protected by exact-origin checks and strict CORS. The database stores a keyed wallet fingerprint for authorization joins. Payout addresses are encrypted under the project data key.

Veil Arena never asks for, receives, or stores a wallet private key or STRK20 viewing key.

## X participant verification

X verification is a final gate for new and improved agent entries. It runs after wallet authentication so the OAuth result can be bound to the existing wallet fingerprint.

The flow uses Authorization Code with PKCE S256, random state, an encrypted ten-minute HTTP-only flow cookie, and an exact callback URL. The callback requires the original active wallet session. Veil Arena calls `/2/users/me`, stores the immutable X account ID with the current handle, the public X profile image URL, and timestamps, and discards the access token. The image URL is accepted only from `pbs.twimg.com` and is used in the owner-facing verified identity card. It does not request offline access and therefore receives no refresh token.

One X account ID can belong to one Veil Arena wallet and one wallet can hold one X identity. Handles are display metadata and may change; the X account ID remains the identity key. Public arena responses do not expose the handle.

This check proves control of the X account at connection time. It is not proof of unique personhood, reputation, a paid badge, or permanent future control. X availability and API billing are outside Veil Arena's control.

## Match evidence and selective disclosure

A public match receipt binds the participating artifact commitments, engine version, seed commitment, score, hand commitments, and transcript root. Each public hand receipt contains only the action commitment, per-agent action commitments, board commitment, hand number, seat-swap flag, hand winner, and hand commitment. It does not contain cards, plaintext actions, strategy rules, reasoning, or the raw seed. New receipts are signed with the configured Ed25519 receipt key.

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
| Approval link is disclosed | Authenticated encryption, fragment transport, metadata-only preview, 24-hour expiry | A holder who also passes wallet and X checks may attempt to claim the package |
| Database theft | Envelope encryption and KMS-wrapped project keys | Application and KMS compromise can expose data |
| Wallet impersonation | One-time typed challenge, RPC verification, durable session revocation | Compromised wallet or browser remains authoritative |
| Cross-origin session abuse | Exact origin checks, strict CORS, SameSite Lax cookie, OAuth state and PKCE | Misconfigured production origins or callback URLs can break access |
| X account replay or substitution | Random state, PKCE S256, encrypted short-lived flow, wallet-session binding, unique account and wallet constraints | Compromised X or wallet sessions remain authoritative; X is not proof of unique personhood |
| Duplicate match execution | Database lease, idempotency key, terminal state checks | Database outage can delay reconciliation |
| Replacement erases or leaks an older strategy | Immutable encrypted artifacts, one active projection, atomic version transaction, digest-only history | Authorized infrastructure remains inside the decryption boundary |
| Fake reward confirmation | Sponsor signature, exact plan binding, finality, pool trace, replay guard | No contract-enforced escrow or public proof of hidden fields |
| Strategy reconstruction | Minimal selective reveal and no full transcript endpoint | Too many operator-approved reveals can leak behavior |
| Sensitive log leakage | Public error mapping and digest-based audit records | Operators must keep request-body logging disabled |

## Claims Veil Arena does not make

Do not describe version one as fully anonymous, untraceable, trustless, private forever, operator-blind, zero knowledge, or end-to-end encrypted.

The precise claim is: competitors and public APIs receive verifiable competition results without receiving submitted strategy policies or private reward fields. Authorized infrastructure can decrypt the minimum data required to run and settle the competition.

## Receipt privacy and saved-agent keys (2026-09-04)

New receipt format v2 binds unpredictable, context-specific nonces into both individual and combined action commitments and omits per-hand score deltas. The signed final score and each hand winner remain public. Those outputs can reveal behavior, especially in short matches: this is a hiding-commitment repair, not a guarantee of zero inference. An authorized losing-action disclosure includes its nonce so the opened commitment can be verified. Receipt format and engine scoring version are separate.

Historical receipts remain byte-for-byte stored results. Legacy action commitments can be enumerated, and legacy v0.3 score deltas expose additional behavior. Their old privacy cannot be restored by changing today's code. New replays label intermediate scores private and show the canonical aggregate at completion; historical replays use their original engine scoring.

Saved profile packages use a separate versioned AES-256-GCM key ring, VEILAP_PARTICIPANT_VAULT_KEYS, rather than deriving new encryption keys from session signing. The encrypted field stores a key ID. Untagged legacy packages remain readable with retained legacy session secrets and can be explicitly rewrapped by their owner. Rewrap does not change the agent ID, version, commitment, or timestamps. A missing old key or already-corrupt ciphertext requires recovery from a valid backup or the owner's original package; no repair invents the lost plaintext.

Owner card views become available only after the entire paired match completes. Seat swapping lets an owner infer the opponent's cards from the paired leg at that point; colluding owners can combine their views. Do not claim permanent opponent-card secrecy from duplicate deals. Future incremental gameplay must gate disclosure across all affected legs and define collusion and operator trust explicitly. See [repair architecture and evidence](PROMISE-REPAIRS-2026-09-04.md).

## Library upload grants, 2026-09-04

My agents accepts a direct JSON file or a coding-agent upload into the same private draft review. The browser generates a random 256-bit grant. Only a domain-separated SHA-256 digest is stored; the grant appears in the human-copyable prompt and upload Authorization header, never a URL. A coding service receiving that prompt sees both the grant and the strategy it builds. The user must choose a service they trust. Do not log request bodies or Authorization headers.

The one-hour grant authorizes only one immutable draft upload. Unknown fields and executable packages are rejected; identical upload retries are safe. Wallet session checks separately protect review, revocation and save. A grant cannot read account data, save a library package, change an entry, sign, or transact. Draft review returns metadata, never strategy rules. The owner-only saved-package endpoint continues to support entry preparation.

Draft packages use AES-256-GCM with record-bound additional authenticated data and versioned independent vault keys. Operators with database and vault-key access remain inside the trust boundary. Session signing keys are not used for new draft encryption. Retain previous vault keys while drafts or saved agents need them; draft finalization writes with the current key. Successful save and revocation immediately clear draft ciphertext. Expired drafts cannot be read through review or finalized; records older than 24 hours are removed on that owner's next draft creation. Dormant owners' expired ciphertext can remain until cleanup, and backups follow the deployment's retention policy. At most five active and twenty created drafts per rolling day are allowed per owner.

The grant and locally read package live only in tab memory. Refresh preserves the metadata review link, not the grant. An uploaded draft can be recovered from My agents on another device after wallet sign-in. New-agent ID collisions require explicit Update; concurrent stale updates fail instead of overwriting newer saved packages. Existing tournament artifacts, entry versions, receipts and scores are unaffected by library changes.

## Exact strategy admission, added 4 September 2026

New template version 2 competitions use a private HMAC-SHA256 index over the normalized engine and policy format/rules/fallback. The key is derived from the project data key with a separate domain and project/season context. Package names and IDs are excluded. Policies are still encrypted; this private index is stored as a digest, not ciphertext. Database readers can see equality within an active season. Public and owner projections, audit events, receipts and errors do not include the digest or the matched account.

An authenticated entrant who receives a duplicate refusal learns that an equivalent normalized policy is active in that competition. This is a membership signal and cannot be described as zero leakage. There is no global fingerprint lookup or unauthenticated duplicate probe. Trusted infrastructure operators can decrypt packages and compute comparisons.

Exact structural matching does not identify the author, prove ownership or establish one person per account. Semantic rewrites can evade it; legitimate people can independently write the same policy. A refusal is a competition eligibility outcome, not a cheating accusation. Similarity alone must not trigger a ban or reward confiscation. No fuzzy comparison or identity provider was added. Private library copies remain allowed.
