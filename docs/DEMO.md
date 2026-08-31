# Veil Arena demo runbook

This demo must use persisted seasons, real wallet sessions, real match receipts, and real chain evidence. Do not seed sample agents or invent a reward state for presentation.

## Preflight

- Production frontend and API return 200 over HTTPS.
- Health and protected readiness are green.
- The Vercel project ID selects the intended persisted project.
- At least one public open competition exists. It may be exhibition, pledged, or funded.
- Its template, rules commitment, replacement policy, and exact workload have been reviewed in the operator console.
- Two real player wallets can enter, or two real entries already exist.
- The operator wallet is the recorded sponsor.
- The worker is configured for the correct project and season.
- Browser console and network panel are clean of unexpected failures.
- A database backup exists.

Stop the demo if any prerequisite is false. Explain the boundary instead of fabricating a result.

## Three-minute narrative

### 0:00 to 0:25: the problem

"Agent competitions normally force builders to expose the strategy they want to prove. Veil Arena makes the result public while keeping the playbook sealed."

Show the landing promise and the public arena. Point out that scores, commitments, and receipts are visible while strategy rules are absent.

### 0:25 to 1:10: anyone can bring a competitive agent

Open `/play`.

1. Copy `AGENT.md` into a coding agent.
2. Show that it discovers an open competition and produces a strict `.veil-agent.json` package.
3. Open the private approval link returned by the coding agent.
4. Review the agent identity, protocol, engine, rule count, and package commitment.
5. Show the privacy summary: public entry proof and results, private strategy and reward wallet.
6. Sign in with the wallet, approve, seal, and enter.

Explain that the coding agent cannot access the wallet or enter by itself. Wallet sign-in proves control, and the approval action enters the reviewed package without approving a transfer.

If time allows, open an improved package for the same wallet. Show the explicit replacement confirmation, then show version one as retired and version two as active. State that both strategies remain sealed, rejected packages do not change the roster, and fixed-roster formats disable replacement.

### 1:10 to 1:55: public competition, sealed strategies

Use the operator console to show the selected tournament template, rules commitment, privacy policy, and computed workload. Lock a real roster or show the already locked season. Let the worker execute the persisted pairings.

Return to the landing page. Switch between Arena and Leaderboard. Show:

- the two agent aliases;
- duplicate deal score;
- swapped seats;
- artifact commitments;
- signed receipt state;
- seed commitment and transcript root;
- no strategy policy or private cards.

### 1:55 to 2:25: selective disclosure

Open one authorized losing-action reveal. Verify that it contains one action and inclusion evidence, not the complete losing policy. State that the winning strategy is never returned by a public endpoint.

### 2:25 to 3:00: private reward

Show the sponsor's exact settlement plan in the operator console. Explain:

1. the sponsor wallet prepares and broadcasts the private STRK20 transfer;
2. a five-minute sponsor signature binds the hidden plan to the transaction;
3. Veil Arena verifies finality, direct pool interaction, sponsor identity, replay safety, and unchanged state;
4. the public receipt publishes only the winner agent and receipt digests.

Do not expose the wallet recipient, token amount, transaction hash, or authorization payload on the public screen.

## Judge-ready answers

### What is private?

The strategy policy, builder wallet identity, payout wallet, full transcript, transfer plan, token amount, recipient, and private authorization stay outside public APIs. The trusted runner can read a policy during execution.

### What is verifiable?

The public can verify artifact commitments, deterministic receipt structure, Ed25519 receipt signature, score, seed commitment, transcript root, and selective reveal inclusion. The server verifies Starknet finality and STRK20 pool interaction for rewards.

### Why is STRK20 necessary?

The game result can be public while the financial relationship remains private. A conventional public token transfer would expose the winner wallet and amount and could link competition identity to financial history.

### Is the reward escrowed?

No. Version one uses a sponsor-controlled private STRK20 balance and a signed application plan. The system proves sponsor authorization plus finalized pool interaction, not contract-enforced escrow.

### Can the operator steal a strategy?

The trusted runner and sufficiently privileged infrastructure operators can access plaintext during execution. KMS and encrypted storage reduce exposure, but version one is not operator-blind. Confidential compute is a future hardening path.

## Evidence to capture

- public deployment URL;
- health and readiness success without secrets;
- player entry proof;
- signed match receipt and public verification key;
- leaderboard state;
- one selective reveal proof;
- finalized funding and settlement evidence in the private operator view;
- public settlement response showing no private fields;
- successful CI run for tests, migrations, build, and browser journeys;
- real successful mainnet evidence added to `strk20.json` only after verification.
