# VeilAP

Private proof. Verifiable delivery. Protected payment.

VeilAP is a private proof-backed settlement workspace for sensitive work. It binds an exact agreement and delivery checkpoint to a human approval, then lets the company settle the approved release privately through STRK20 on Starknet.

The work does not need to be a crypto project. VeilAP is designed for sensitive engineering, security, research, data, automation and other technical engagements. Its evidence model is repository-agnostic: a checkpoint can be bound to any code repository or approved artifact source without making the code host part of the payment system.

## The problem

Sensitive external work usually forces a company to choose between two weak options:

- expose the relationship, scope and payment on a public payment rail;
- keep everything off-chain and lose a durable connection between the reviewed delivery and its settlement.

VeilAP connects those records without publishing the private brief, repository, contributor relationship, review discussion or payment details.

## How it works

1. A company creates a private agreement with versioned acceptance criteria.
2. An invited contributor submits a delivery checkpoint from the agreed repository or artifact source.
3. VeilAP binds the checkpoint to its exact agreement version and artifact digest.
4. Deterministic checks run first; an optional AI assessment can advise the reviewer.
5. An authorized human accepts or rejects the checkpoint.
6. The company wallet gives the final signature for a private STRK20 milestone payment.
7. VeilAP reconciles the transaction and issues audience-specific receipts.

The model also supports a later royalty release calculated from an agreed rate and a recorded revenue event.

## What VeilAP proves

VeilAP can prove that:

- the parties recorded a specific version of the work terms;
- a specific delivery checkpoint was submitted against those terms;
- an authorized reviewer recorded a decision;
- an approved release was submitted and reconciled through the STRK20 pool.

VeilAP does not prove legal ownership, inventorship, patentability, universal code correctness, absence of vulnerabilities or global uniqueness.

## Why STRK20

Private transfers inside the STRK20 pool can conceal the sender, recipient, token, amount and private note graph from public observers. Deposits, withdrawals, pool interaction and timing remain public or potentially correlatable.

VeilAP uses the wallet-first integration route:

- the user's privacy-enabled wallet owns viewing keys;
- the wallet discovers private notes and prepares the proof;
- the company wallet signs every release;
- VeilAP never stores a Starknet signing key or STRK20 viewing key;
- a transaction is not marked paid from a hash alone.

## Selective receipts

VeilAP creates a different signed receipt for each audience:

- the company can see the project binding, approved amount and release state;
- the contributor can see an opaque project alias, their checkpoint and release state;
- an auditor can see opaque project and agreement commitments plus a calculation commitment, without project names, recipients or private amounts.

Receipt payloads are signed with Ed25519 and encrypted at rest. The public verification key is exposed at `/api/receipts/public-key` only when persisted signing configuration is installed. Preview mode intentionally issues no signed receipt and exposes no signing key.

## Repository-agnostic evidence

The repository is an evidence source, not a platform dependency. The same checkpoint envelope can bind:

- a GitHub, GitLab or self-hosted repository commit;
- a reviewed archive or build artifact;
- a security report;
- a research or data delivery;
- an API or automation package.

Every correction creates a new checkpoint. Existing checkpoints remain append-only and tied to the agreement version under which they were reviewed.

## Current status

The current public commit contains the accepted responsive VeilAP interface and a synthetic no-key preview. It performs no payment and does not claim that a preview release was sent.

The active implementation path is:

- repository-bound agreement and checkpoint records;
- wallet capability detection and signed sessions;
- encrypted evidence persistence;
- deterministic verification and human acceptance;
- STRK20 shield, private transfer and reconciliation;
- milestone, royalty and selective-receipt flows.

The required path is wallet-first and noncustodial. A Cairo helper is optional and will not be added unless the complete wallet flow is already proven safely.

## Product routes

- **/** - public VeilAP landing page
- **/sign-in** - wallet entry surface
- **/workspace** - synthetic product workspace

All routes currently open without a wallet or RPC key in preview mode.

## Stack

- Next.js 16 and React 19
- strict TypeScript
- local Manrope and Newsreader variable fonts
- starknet.js 10.4.0
- Starknet Wallet Standard discovery
- STRK20 Wallet API through WalletAccountV6
- exact dependency pins

## Security setup

Persisted mode requires:

- Neon Postgres for sessions, project records, append-only checkpoints, releases and receipts;
- one AWS KMS key restricted to Encrypt and Decrypt for the deployment role;
- an Alchemy Starknet Mainnet RPC URL held only in `STARKNET_RPC_URL`;
- Ed25519 receipt keys held only in `VEILAP_RECEIPT_SIGNING_PRIVATE_KEY` and `VEILAP_RECEIPT_SIGNING_PUBLIC_KEY`.

The backend unwraps each project's data key only for an authorized request. Preview mode uses memory-only keys and does not contact Neon, KMS, Alchemy or a wallet.

## Start locally

~~~bash
npm install
copy .env.example .env.local
npm run dev
~~~

Open:

- http://localhost:3000
- http://localhost:3000/sign-in
- http://localhost:3000/workspace

Before wallet integration, replace YOUR_ALCHEMY_KEY in .env.local. Keep the RPC URL server-only because it contains the Alchemy key.

## Checks

~~~bash
npm run check
npm run prove
npm run test:e2e
npm run build
~~~

`npm run prove` rebuilds the same domain functions used by the application and refuses a non-deterministic report. `npm run test:e2e` uses a Playwright-only fake wallet fixture for capability and rejection paths. That fixture is not available to production code.

## STRK20 sprint record

The root strk20.json is the machine-readable sprint manifest. Fields remain empty until real evidence exists.

~~~json
{
  "transactions": [],
  "contracts": [],
  "demo_video": "",
  "demo_url": ""
}
~~~

Target network: **SN_MAIN**

Official STRK20 pool:

~~~text
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
~~~

The intended three mainnet records are:

1. company shield;
2. private milestone transfer;
3. private royalty transfer.

They will be added only after each transaction succeeds, touches the pinned pool and reconciles in VeilAP.

## Privacy boundary

Version one provides trusted application privacy, not end-to-end encryption. The authorized VeilAP backend may decrypt project evidence to serve it to an authorized reviewer. Sensitive application records are encrypted at rest and in transit.

Public or potentially observable information includes pool interaction, timing, viewing-key registration, public deposit and withdrawal legs, network metadata and correlation from distinctive behavior.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the detailed claim boundary.

## What is synthetic

The local workspace contains synthetic project, agreement, checkpoint, amount and transaction fixtures. Preview acceptance reserves an in-memory release intent only. It does not call a wallet, move funds, create a server record or touch Starknet Mainnet.

## What VeilAP does not prove

VeilAP does not prove that delivered work is legally owned by a party, that code is universally correct, that a security report found every vulnerability, that a contributor is trustworthy outside the recorded engagement, or that a private payment is immune to timing or metadata correlation. It proves only the signed and persisted records described above, subject to the trusted backend and configured key custody.

## License

MIT
