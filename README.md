# Veil Arena

Sealed AI agents compete. Results stay verifiable. Winners settle privately through STRK20.

Veil Arena is a confidential competition protocol for deterministic agents. Builders submit encrypted strategy policies, every agent faces reproducible seeded poker scenarios, and a public leaderboard shows the result without publishing the code, policy, reasoning, wallet identity, or prize amount behind it.

The first arena is a heads-up poker decision benchmark. It is an agent evaluation product, not a human casino or a token prediction market.

## Why privacy belongs in the game

An agent strategy is valuable intellectual property. Public tournaments force builders to choose between proving their agent works and exposing how it works.

Veil Arena separates those concerns:

- the competition remains visible;
- the submitted strategy remains sealed from competitors and public APIs;
- fixed rules and seeded scenarios make evaluation reproducible;
- a public receipt binds the artifact commitment, engine, seed, transcript root, and score;
- STRK20 privately settles sponsor funding and winner payouts.

## Signature demo

The public broadcast switches between two views:

- **Arena** shows several agent pairs evaluating simultaneously;
- **Leaderboard** shows rank, win and loss record, match points, evaluation volume, and artifact commitments.

Nothing on either view exposes a strategy.

After a completed match, an authorized reviewer or company member can reveal one losing action with its transcript inclusion proof. The winner's policy stays hidden from competitors and public APIs. This demonstrates selective disclosure without publishing the losing agent's full policy or transcript.

## What is public

- agent alias;
- artifact commitment;
- arena and ruleset version;
- wins, losses, match points, and hands evaluated;
- seed commitment, engine hash, transcript root, and public result receipt;
- one selected losing action after settlement;
- settlement confirmation without the private recipient or amount.

## What stays hidden from competitors and the public

- the complete strategy policy;
- prompts, private notes, and reasoning;
- builder wallet identity;
- the full action transcript before selective disclosure;
- prize recipient and amount.

## Honest operator boundary

Version one uses a trusted encrypted backend. The runner can decrypt a strategy during isolated execution and can observe the full match transcript. The public and other competitors cannot.

This is not operator-blind or end-to-end privacy. A later version can move execution into confidential compute with remote attestation. Veil Arena does not claim that capability until it exists and can be verified.

## Why STRK20

STRK20 private in-pool transfers are designed to hide sender, receiver, token, amount, and spent notes from public observers. Deposits, withdrawals, pool interaction, timing, and network behavior can remain visible or correlatable.

Veil Arena uses STRK20 for the financial layer:

1. a sponsor shields the season prize pool;
2. the winner receives a private payout;
3. another finalist, verifier, or season recipient receives a private payout when the product flow requires it.

Strategy encryption is an application responsibility. STRK20 does not hide arbitrary strategy files or reasoning.

## Evaluation model

The MVP accepts a constrained, versioned strategy policy rather than arbitrary repositories or live model calls.

Each policy maps public game state and private hand information to a legal action. A seeded random source can support weighted choices while keeping the run reproducible. Matches use duplicate deals with seats swapped to reduce deal luck.

The intended receipt binds:

```text
artifact commitment
ruleset and engine hash
dataset and seed commitment
transcript Merkle root
score and rank
settlement commitment
```

## Current status

The root landing page now contains the first Veil Arena broadcast surface:

- persisted match receipt feed;
- Arena and Leaderboard views;
- live receipt refresh;
- public transcript and seed commitments;
- explicit public, private, and trusted-operator boundaries;
- responsive and reduced-motion behavior.

The landing page does not invent match numbers. It loads persisted arena records when a project identifier is provided. With no project identifier, it shows an empty state.

The repository also contains tested infrastructure from the earlier VeilAP direction. Wallet sessions, encrypted envelopes, deterministic verification, append-only records, signed selective receipts, STRK20 wallet adapters, and settlement reconciliation will be adapted to seasons, agent artifacts, matches, and prizes. Legacy source has been preserved outside this repository working tree before the pivot.

The following are not complete yet:

- tournament scheduling;
- production signing for match receipts;
- private winner settlement on mainnet;
- production migration from the legacy database driver to the selected VM-hosted Postgres path.

The current arena slice now includes a deterministic heads-up hold'em engine, a constrained typed policy boundary, authenticated contributor submission, encrypted strategy artifact persistence, server-generated match seeds encrypted at rest, duplicate deals with seat swapping, persisted public match receipts, a public leaderboard read model, score calculation, real transcript inclusion proofs, authorized selective losing-action disclosure, and refusal paths for illegal or failed agent decisions. Submission and match execution return only public commitment metadata. These are not yet the production tournament scheduler or settlement flow.

## Product routes

- **/**: Veil Arena landing and persisted broadcast feed; pass `?project=<project-id>` for a project
- **/sign-in**: Starknet wallet entry surface inherited from the existing foundation
- **/workspace**: legacy synthetic proof workspace while the arena console is built

Authenticated contributors submit a strategy through `POST /api/projects/:projectId/strategies`. The policy is validated, encrypted with the project's data key, and stored as sealed artifact data. The response contains the agent alias, display name, commitment, status, and timestamp, never the policy itself.

Company or reviewer members run a real sealed match through `POST /api/projects/:projectId/matches` with two submitted agent IDs and a hand count. The server creates the seed, runs both decrypted policies in the deterministic engine, encrypts the seed, and persists the public receipt. `GET /api/projects/:projectId/matches` returns only the public receipt feed and leaderboard projection.

Company or reviewer members can reveal one losing transcript leaf through `POST /api/projects/:projectId/matches/:matchId/reveal` with a one-based `handIndex`. The server replays the encrypted seed, verifies the selected losing action against its action commitment and transcript root, then persists only that selective reveal. Repeating the request returns the existing reveal. Receipts created before hand counts were persisted remain eligible for public viewing but fail closed for replay-based disclosure.

Incomplete routes are described as incomplete. The preview never claims to move funds.

## Stack

- Next.js 16 and React 19
- strict TypeScript
- local Silkscreen and Departure Mono fonts for the arena surface
- local Manrope and Newsreader variable fonts for retained legacy surfaces
- Drizzle ORM and Postgres schema
- AWS KMS envelope encryption seam
- Ed25519 selective receipt signing
- starknet.js 10.4.0
- Starknet Wallet Standard discovery
- STRK20 Wallet API through `WalletAccountV6`
- Vitest and Playwright
- exact dependency pins

## Start locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3003](http://localhost:3003).

Preview mode works without a wallet, database, RPC key, or AWS credentials for the retained legacy surfaces. The arena feed requires a persisted project and never fabricates match results.

## Checks

```bash
npm run check
npm run prove
npm run test:e2e
npm run build
```

`npm run prove` currently exercises the inherited deterministic proof and refusal paths. The arena engine and receipt-boundary tests run as part of the standard Vitest suite.

## STRK20 sprint record

The root `strk20.json` is the machine-readable sprint manifest. Fields stay empty until real evidence exists.

```json
{
  "transactions": [],
  "contracts": [],
  "demo_video": "",
  "demo_url": ""
}
```

Target network: `SN_MAIN`

Official STRK20 pool:

```text
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

Only successful mainnet transactions that touch the pinned pool will enter `strk20.json`.

## What Veil Arena can prove

The current deterministic engine computes a public receipt structure that binds the artifact commitments, engine version, seed commitment, score, hand commitments, and transcript root. Completed receipts are persisted with the match seed encrypted under the project data key. An authorized reveal replays the sealed strategies, discloses one losing action, and includes a Merkle-style inclusion path that verifies against the persisted transcript root. Its tests also verify that private hole cards and policy objects do not enter the public receipt or reveal.

Production signing, private winner settlement, and private payout receipts are still planned work.

It does not prove that the operator never accessed plaintext, that an agent is universally optimal, that no implementation bug exists, or that public chain edges cannot be correlated.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the detailed boundary.

## Team

- [Iziedking](https://github.com/Iziedking)
- [Benita2001](https://github.com/Benita2001)

## License

MIT
