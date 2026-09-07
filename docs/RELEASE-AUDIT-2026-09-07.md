# Veil Arena deadline audit

## Release decision

Local repairs are implemented. This is not a mainnet-success certificate or an independent security audit. No Git write, deployment, production migration, wallet signature, or transaction was performed by this audit.

The official [Private Sprint page](https://strk20.starknet.io/hackathon) sets September 7, 23:59 UTC as the deadline (September 8, 00:59 in Lagos). Integration and working mainnet together account for 60% of judging. The [submission instructions](https://github.com/starkience/strk20-hackathon#submitting) require a licensed public repository, a working demo, a three-minute video, and at least three successful STRK20 mainnet transactions in `strk20.json`.

The owner has no verified transaction hashes or video yet. `strk20.json` remains empty. Local test-wallet receipts are not submission evidence.

## Defects repaired

| Finding | Repair and scope |
| --- | --- |
| Wallet actions sent decimal strings where the Wallet API expects hexadecimal FELTs | Exact BigInt conversion for deposit and private-transfer amounts. Installed Starknet 10.4.0 forwards these values without conversion. No floating-point arithmetic. |
| Mandatory deposit simulation blocked the first funding action | Follow the official starter-kit direct invoke path. The wallet owns token approvals, proving and transaction submission. Retain server receipt verification and hidden-plan authorization. |
| Confirmation failure or reload offered another deposit | Save the returned hash, scoped to pool and sponsor, in same-tab session storage. Verify that hash rather than sending again. Apply the same separation to pending payouts. |
| Standard templates discarded the selected ranked distribution | Include `rewardDistribution` in season creation, not only custom rules. |
| Free private challenges required a nonexistent reward pool | Permit invitation creation for an optional-reward season without a pool; continue rejecting configured but unverified pools and persistence failures. |
| A valid server session could appear connected with no signing account | Restore only a matching wallet account; otherwise offer reconnection. Compare normalized felt addresses. |
| PostgreSQL capacity regression used invalid rules | Use a valid capped custom round-robin fixture and retain the exactly-one-winner concurrency assertion. |
| Odd sampled-round rosters could miss the qualification sample | Rotate byes fairly and add sufficient rounds. This affects newly generated schedules, not historical persisted results. |
| Sound control was hard to identify and enabling music could miss browser gesture permission | Use a recognizable speaker icon, explicit pressed state, and start audio from the enable gesture. Mute stops music and replay cues. |
| Mobile navigation, missing-wallet text and share state could overflow | Bound navigation, retain accessible wallet names, and keep controls usable at narrow phone widths. |
| Demo instructions named removed controls and described ranked payouts as absent | Update the runbook to the actual share and funding flow, with explicit live-verification limits. |

## Verification results

| Check | Final observed result |
| --- | --- |
| Typecheck, lint and real PostgreSQL unit/integration suite | 64 files, 305 tests passed, no skips with the isolated database configured |
| Production build | Passed; 35 static pages generated, dynamic routes compiled |
| Complete desktop/mobile Playwright suite | 108/108 passed in the final single run |
| Funding/ranked split/payout recovery/audio regression group | 8/8 passed separately, then passed in the complete suite |
| Promise invariants | 10/10 passed against isolated PostgreSQL |
| Worker timeout recovery, process restart, health heartbeat | All passed |
| Database migrations | Ran twice successfully against disposable PostgreSQL |
| Deterministic proof script | Replay, transcript inclusion, tamper rejection and private-field omission checks passed |
| Null Jack benchmark | 256 matches, zero failures, held-out results unchanged |
| Runtime and complete dependency audits | Zero reported vulnerabilities |
| Final diff | No whitespace errors; normal Windows line-ending warnings only |

The labelled disposable audit database was removed after verification. No production records were deleted. Generated browser screenshots/logs remain untracked and are excluded from the release commands.

## Funding diagnosis: what is established

The installed wallet API defines `amount` as a hexadecimal felt. The old adapter sent decimal amounts. Regression tests first reproduced this mismatch, then passed with exact hex encoding. The official starter-kit Shield handler invokes a deposit through `WalletAccountV6` directly; manually constructing token-approval calls in the app is not the remedy established by this audit.

This proves a client defect and its repair, not the exact extension-side cause of every production error. No real sponsor transaction has yet established that the complete deployed funding path succeeds.

The read-only production pool-fee endpoint returned 6 STRK on September 7. The UI now shows the live fee separately from the selected reward. It may change. A new wallet may request token approval before deposit, and the app requires a separate typed-data receipt authorization. Do not advertise one signature.

## Boundaries and remaining release gates

- The website returned HTTP 200 and the API reported a reachable persisted database. These checks do not prove deployment freshness, worker readiness, KMS decryption, wallet connectivity or a successful payment.
- Deploy the exact reviewed changes through the owner's normal Git/CI workflow. Both frontend and backend must be current before testing invitations and funding.
- Use a compatible mainnet wallet for one complete funded competition: selected amount, deposit receipt, two distinct real entrants, persisted match receipts, and a verified private payout. Both recipients and sponsor need the relevant wallet capabilities. Then collect enough verified transactions for the submission, without fabricating hashes or transacting solely from this document.
- Hash recovery is same-tab only. Closing the tab, clearing storage, a provider error before returning the hash, or a finalized reverted transaction requires checking wallet/chain activity before another submission. There is no cross-device pending-intent journal or automatic refund/retry.
- Sponsor funding is a shielded sponsor-controlled balance, not escrow. The sponsor can spend it elsewhere. A signed plan binds hidden details; a public receipt alone does not reveal or independently prove the concealed amount and recipient.
- Ranked payouts support fixed committed presets. Arbitrary custom percentage editors are not implemented. Tied payout ranks and insufficient eligible recipients remain fail-closed; do not choose a top-eight payout for a two-agent demo or promise automatic tie resolution.
- The product is a deterministic poker-decision competition with verified playback after execution, not a live multi-street poker engine or public reasoning stream. Points are 3/1/0 per match, not highest-card ranking. The trusted runner and privileged infrastructure can read strategies; there is no operator-blind privacy claim.
- Automated tests use an isolated database and test wallet. They cannot certify mainnet proving, allowance, recipient registration, RPC tracing, hidden-plan signatures, production authorization or video readiness.

## Owner release sequence

From this repository, after reviewing the diff:

```sh
git add src docs tests HACKATHON_RESEARCH.md
git diff --cached --check
git diff --cached --stat
git commit -m "fix: repair STRK20 funding and competition flows"
git push origin main
```

These paths cover the audit's source, tests and documentation. Inspect staged content before committing, especially if another task has changed these directories since the audit.

1. Review the scoped diff and publish through the normal CI workflow. Do not stage unrelated `ui-artifacts`, browser-generated `.playwright-mcp` files or generated `next-env.d.ts`.
2. Confirm all release checks and the deployment succeed. The previous failing CI cannot prove current production contains these repairs.
3. Follow `docs/DEMO.md` with real wallets, checking receipts before retrying anything. Prefer a two-agent, one-winner proof loop for the first mainnet test.
4. Verify the successful hashes and pool interaction before adding evidence to `strk20.json`; record the three-minute video only after the real loop works.

For frontend release diagnostics, the Vercel CLI is not installed. Install it with `npm i -g vercel` if using owner-authorized deployment/log inspection. This audit did not install it or change hosting.
