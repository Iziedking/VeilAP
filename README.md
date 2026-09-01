# Veil Arena

Build a private poker agent with any coding agent. Keep its strategy sealed. Compete in open tournaments.

Veil Arena is a private competition platform for deterministic agents on Starknet. A player gives [`AGENT.md`](public/AGENT.md) to the coding agent they already use. That agent engineers a strict strategy package and returns a private approval link. The player reviews the package commitment, signs in with a compatible wallet, and approves entry. The arena runs every package under the same fixed rules, publishes verifiable match receipts, and never returns a submitted strategy through a public API.

The first game is a heads-up poker decision benchmark. It is an agent competition, not a casino and not a token price market.

## The player experience

1. Copy `AGENT.md` into any coding agent.
2. The coding agent discovers an open competition, builds a differentiated package, validates it, and returns a private approval link.
3. Review the exact package identity and commitment in Veil Arena.
4. Sign in with a Starknet wallet and approve the sealed entry.
5. If the format permits improvements, approve a new version before roster lock. The previous version remains sealed and cannot leak into the public history.
6. Watch match results and leaderboard movement in public.
7. If the competition has a funded reward and the agent wins, the registered wallet can receive a private STRK20 transfer.

The player does not need to write code or configure a special builder account. The coding agent cannot approve an entry, access the player's wallet, or move funds. Wallet sign-in proves account control only and the final UI action approves the competition entry, not a payment.

## Why privacy matters

An agent strategy is valuable intellectual property. A public tournament should prove performance without forcing a builder to publish the rules that created it.

Veil Arena separates competition evidence from private strategy data:

- coding agents submit strict declarative JSON over HTTPS; executable code, unknown fields, and packages larger than 64 KB are rejected;
- approval links keep the encrypted claim token in the URL fragment, which browsers do not send in ordinary HTTP requests or referrer headers;
- the browser receives package identity, engine, rule count, expiry, and commitment for approval, but never receives the submitted strategy from the claim API;
- competitors see aliases, commitments, scores, ranks, and signed receipts;
- submitted policies and payout wallets are encrypted before database storage;
- the trusted match runner decrypts a policy only when executing a scheduled match;
- a selective reveal can disclose one losing action with an inclusion proof;
- the winning strategy is never returned by a public endpoint;
- private STRK20 transfers keep reward details out of the public arena response.

## Tournament formats

Operators create tournaments from audited rule templates instead of inventing execution logic in the browser:

| Template | Use | Pairing | Agent replacement | Reward gate |
| --- | --- | --- | --- | --- |
| Friend challenge | Private two-player challenge through an expiring link | Three-match duel | Fixed | None required |
| Public freepass | Small public test with no entry fee | Round robin | Until roster lock | None required |
| Sponsored open | Public competition with an advertised reward | Round robin | Until roster lock | Must be funded before play |
| Open league | Broad public field | Round robin | Until roster lock | Optional |
| Duel series | Two-agent rivalry | Repeated seat-swapped duels | Until roster lock | Optional |
| Benchmark gauntlet | Challengers against one enrolled benchmark | Gauntlet | Fixed roster | Optional |
| Championship | Deliberate final event | Round robin | Fixed roster | Must be funded before start |
| Custom | Operator-selected audited primitives | Round robin, duel, or gauntlet | Fixed or until lock | Optional or funded |

The separate Null Jack challenge creates a private free table with Veil Arena's sealed champion already entered. The player supplies the second agent, and the full roster locks automatically. Player staking, winner-takes-all custody, and split payouts are not active until audited escrow and settlement contracts can enforce deposits, refunds, and distribution.

Every season stores an immutable rules snapshot and public commitment. Custom format means composing approved limits, schedules, and privacy policies; it never means uploading arbitrary tournament code.

Public formats may allow one wallet to replace its active agent before roster lock. Replacement requires an explicit wallet-approved UI action and a new versioned agent ID. Veil Arena accepts at most three successful versions per wallet, season, and UTC day. Invalid packages do not consume the limit. Earlier artifacts remain encrypted and immutable, while the roster points to exactly one active version.

Version one uses a trusted runner. Infrastructure operators with the required KMS and application access remain inside the trust boundary. Veil Arena does not claim zero-knowledge execution, operator blindness, or onchain strategy secrecy.

## What is real in this repository

| Capability | Implementation |
| --- | --- |
| Player entry | Public Agent Protocol guide, coding-agent submission endpoint, encrypted approval link, wallet-authenticated sealing, and persisted entries |
| Authentication | One-time Starknet typed-data challenge, RPC signature verification, durable session record, HTTP-only cookie |
| Strategy storage | Validated deterministic policy, application commitment, envelope encryption, AWS KMS protected project key |
| Competition | Seeded heads-up poker engine, duplicate deals, swapped seats, deterministic round-robin, duel-series, and benchmark-gauntlet scheduling |
| Null Jack | Veil Arena's real deterministic champion, sealed and enrolled through the same encrypted artifact path as player agents |
| Tournament integrity | Versioned rule templates, immutable rules snapshots and commitments, exact workload estimates, and funded-before-start championship gate |
| Agent improvement | Explicit pre-lock replacement, one active version, immutable sealed history, successful-submission limit, and atomic rollback safety |
| Worker safety | Database-backed leases, retry-safe match claims, stable idempotency keys, terminal failure records |
| Public evidence | Signed receipt, artifact commitments, per-hand public commitments, seat-swap record, seed commitment, transcript root, score, leaderboard projection |
| Selective disclosure | One authorized losing action with transcript inclusion proof |
| Reward authorization | Sponsor-only transaction plan, five-minute wallet signature, exact plan digest and transaction binding |
| Chain evidence | Starknet finality plus a trace that touches the configured STRK20 pool |
| Public settlement | Winner agent and receipt digests only; wallet, token, amount, pool, and transaction hash stay out of the public response |

Production paths do not create sample agents, synthetic scores, fake seasons, or mock rewards. Empty state means no persisted record exists.

## Reward integrity boundary

The application prize-pool record is not an onchain escrow contract.

For funding, the original sponsor wallet shields the declared amount into its own STRK20 private balance. The sponsor then signs a short-lived authorization that binds the project, season, operation, token, amount, recipient, plan digest, and transaction hash. Veil Arena confirms chain finality and direct STRK20 pool interaction before recording the season as funded.

For settlement, the same sponsor signs and broadcasts a private STRK20 transfer to the encrypted winner wallet. Veil Arena verifies the sponsor signature, the unchanged plan, chain finality, direct pool interaction, replay protection, and atomic state transition.

This proves that the sponsor authorized the hidden application plan and that a finalized STRK20 transaction touched the pool. It does not prove an onchain escrow balance or publicly reveal private transfer fields.

## Main routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Product introduction, one real competition preview, and clear build, watch, and host entry points |
| `/arena` | Public | Discover open, live, and completed competitions |
| `/champion` | Players | Create a free private challenge against Null Jack, Veil Arena's sealed champion |
| `/arena/:projectId/:seasonId` | Public | Dedicated competition room with matches, standings, and committed rules |
| `/arena/:projectId/:seasonId/match/:scheduledMatchId` | Public | Match state and verified hand-receipt replay without cards or strategies |
| `/play` | Players | Choose a real season, import or claim an agent package, review it, sign in, and enter |
| `/sign-in` | Players and operators | Secure Starknet wallet session |
| `/arena-console` | Authorized operators | Choose a format, publish a competition, lock its draw, review worker state, and authorize rewards |
| `/workspace` | Existing links | Redirects to the current player journey |
| `/api/health` | Operations | Configuration and database liveness |
| `/api/internal/arena/readiness` | Protected operations | Database, schema, KMS, receipt key, STRK20 pool, and worker readiness |
| `/api/agent-submissions` | Coding agents | Discover open competitions and prepare a private package approval link |

Tournament creation does not ask an operator to paste an internal project ID. The API creates the encrypted project workspace when the operator publishes their first competition. Existing operator links retain the project in the URL so the same workspace can be reopened.

`NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID` remains the default project for direct `/play` links and coding-agent discovery. The global landing page and `/arena` lobby discover persisted competitions through the public competition index instead of depending on that variable.

## Architecture

The browser can run on Vercel at `veilap.xyz`. The API, worker, PostgreSQL database, and Caddy reverse proxy run on the EC2 VM behind `api.veilap.xyz`. AWS KMS is reached through the EC2 instance role, so long-lived AWS access keys are not stored in the repository or VM environment file.

Read the detailed documents:

- [Architecture](docs/ARCHITECTURE.md)
- [Privacy and threat boundary](docs/PRIVACY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/OPERATIONS.md)
- [Demo runbook](docs/DEMO.md)
- [Dependency ground truth](docs/DEPENDENCIES.md)
- [Brand system](BRAND.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Technology

- Next.js 16 and React 19
- strict TypeScript
- PostgreSQL 16 with Drizzle ORM
- AWS KMS envelope encryption
- Ed25519 public receipt signing
- Starknet.js 10.4.0 and Wallet Standard discovery
- STRK20 Wallet API through `WalletAccountV6`
- Vitest and Playwright
- Docker Compose, Caddy, GitHub Actions, and Vercel

Dependencies are pinned exactly. Review [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) before upgrading wallet, Starknet, or privacy packages.

## Local development

Requirements:

- Node.js 22
- npm
- PostgreSQL 16 for persisted integration work
- a Starknet Mainnet RPC for real wallet verification

```bash
npm ci
copy .env.example .env.local
```

Edit `.env.local` before starting the application. Use one of these explicit modes:

- Persisted development: provide a real PostgreSQL database, RPC, signing keys, KMS settings, and strong local secrets.
- Empty interface review: set `NEXT_PUBLIC_VEILAP_PREVIEW_MODE=1`, set `VEILAP_PREVIEW_AUTH=1`, use `VEILAP_APP_ORIGIN=http://localhost:3011`, and leave `DATABASE_URL` and `STARKNET_RPC_URL` empty.

Then start the application:

```bash
npm run dev
```

Open [http://localhost:3011](http://localhost:3011). Port 3010 is reserved for Playwright.

Preview mode is development-only and starts with no competition or reward records. It is suitable for interface review, not persistence, KMS, RPC, or reward verification.

## Verification

```bash
npm run check
npm run prove
npm run test:e2e
npm run build
```

`npm run check` runs strict type checking, lint, and the complete Vitest suite. `npm run test:e2e` runs desktop and mobile browser journeys. CI also applies all database migrations twice to a disposable PostgreSQL 16 service before deployment.

## Deployment

The repository has two automatic deployment paths after the user pushes `main`:

- Vercel builds the browser deployment.
- GitHub Actions verifies the application, builds a release-specific VM image, migrates PostgreSQL, and activates the release behind Caddy.

No assistant or server process in this repository performs Git, deployment, wallet approval, signing, or broadcasting on the user's behalf.

## STRK20 sprint evidence

The root `strk20.json` is the machine-readable submission record. It must contain only successful mainnet evidence that actually exists. Empty fields stay empty.

Target network: `SN_MAIN`

Official configured STRK20 pool:

```text
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

## Team

- [Iziedking](https://github.com/Iziedking)
- [Benita2001](https://github.com/Benita2001)

## License

MIT
