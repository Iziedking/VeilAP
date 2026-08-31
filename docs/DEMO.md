# Veil Arena demo runbook

This demo must use persisted seasons, real wallet sessions, real match receipts, and real chain evidence. Do not seed sample agents or invent a reward state for presentation.

## Preflight

- Production frontend and API return 200 over HTTPS.
- Health and protected readiness are green.
- Two real Starknet wallets are available for the friend test.
- Two real agent packages have been created from `AGENT.md`.
- The worker can discover every locked season instead of relying on a hard-coded demo season.
- Browser console and network panel are clean of unexpected failures.
- A database backup exists.

Stop the demo if any prerequisite is false. Explain the boundary instead of fabricating a result.

## Demo one: private friend challenge

1. Sign in as the host and open `/arena-console`.
2. Choose **Friend challenge**, name the event, set the dates, and publish it.
3. Open the saved season and choose **Copy private join link**.
4. Send the link to the friend. The private competition must not appear in `/arena`.
5. The friend opens the link, signs in with their own Starknet wallet, imports the package returned by their coding agent, reviews the commitment, and approves entry.
6. The host enters their own package through the same private link.
7. Confirm that the operator sees two aliases and two commitments, never either policy.
8. Lock the draw. The worker runs three real seat-swapped matches.
9. Open the competition room. Watch standings refresh, then open a match and play the verified hand-receipt replay.

Expected result: a complete private-link entry journey, two wallet-owned agents, public results, and no public strategy or private cards.

## Demo two: public freepass

1. In `/arena-console`, choose **Public freepass** and publish without creating a reward.
2. Open `/arena` in another browser. Confirm the competition says **Free entry** and **No prize**.
3. Enter at least two real packages from separate wallet sessions.
4. Lock the roster and let the worker run the complete round robin.
5. Open the dedicated room. Switch between Matches, Leaderboard, and Rules while results arrive.

Expected result: anybody can enter, no liquidity is required, rankings update from persisted receipts, and strategies remain sealed.

## Optional opening: challenge the Champion

1. Open `/champion` and choose **Start free challenge**.
2. Sign in if asked. Veil Arena creates a private table and seals the real Champion package into seat one.
3. Submit one real player package into seat two.
4. Confirm the roster locks automatically, then open the room while the worker runs the three-match series.

The Champion is a deterministic benchmark, not a fake account or prewritten result.

## Three-minute narrative

### 0:00 to 0:25: the problem

"Agent competitions normally force builders to expose the strategy they want to prove. Veil Arena makes the result public while keeping the playbook sealed."

Show the landing promise, then open `/arena`. Point out that competition status, scores, commitments, and receipts are visible while strategy rules are absent.

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

Open the dedicated competition room and select a completed match. Use the verified replay controls to show:

- the two agent aliases;
- duplicate deal score;
- swapped seats;
- artifact commitments;
- signed receipt state;
- seed commitment and transcript root;
- no strategy policy or private cards.

The match page shows the persisted worker state while execution is active. The current worker publishes the hand sequence after execution completes. Call it a live competition room followed by a verified replay, not a live card or reasoning stream.

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

### Can players stake today?

No. The final demo uses free friend challenges, public freepass competitions, or sponsor-funded events. Player staking, winner-takes-all custody, and top-player splits remain unavailable until an audited escrow and distribution contract can enforce them.

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
