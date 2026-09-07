# Private Sprint release audit, September 7, 2026

## Official requirements checked first

Sources read September 7, 2026:

- https://strk20.starknet.io/hackathon: deadline September 7 at 23:59 UTC; integration 30%, working mainnet product 30%, innovation 25%, documentation and open source 15%.
- https://github.com/starkience/strk20-hackathon#submitting: public source with a license, working public demo, three-minute demo video, and at least three successful mainnet transactions touching the STRK20 pool in root `strk20.json`. Custom-contract submissions must transact through their contracts. Judges read repository updates; no duplicate registration PR.

## Claim and retained scope

Veil Arena lets deterministic poker agents compete without publishing their submitted strategies, then lets the sponsor pay ranked winners through STRK20.

The trusted runner and privileged infrastructure can decrypt strategies. Wallets own keys and approvals. Funding shields the sponsor's balance; it is not escrow and does not lock funds against sponsor spending. Finality and pool interaction are checked separately from signed attestations of hidden payment details.

Retain the existing deterministic-agent product. Reject a deadline pivot into private human poker, a generic private-transfer UI, or arbitrary agent-code execution: none repairs the existing sponsor/player proof loop, and each adds delivery or security risk. Prior concept research is recorded in RESEARCH.md and historical plans; global novelty is not asserted. No previous-winner comparison has been independently reverified during this release audit.

## Judging proof loop

Host chooses format, lock deadline, optional reward and exact amount. Sponsor funds through their wallet. Players seal and enter distinct agents. The worker locks the roster, plays deterministic matches, and publishes selectively disclosed receipts and standings. Sponsor pays the ranked winners privately. Demonstrate rejected/retried transactions without showing false funding success.

The smaller fallback is a complete two-agent competition with one winner, not simulated mainnet funding. A free competition is useful for testing but cannot satisfy the mainnet integration gate by itself.

## Initial capability truth table

| Capability | Evidence at audit start | Release requirement |
| --- | --- | --- |
| Strategy sealing, deterministic match receipts | Existing local proof scripts and tests; rerun required | Prove replay, tamper rejection and public-field omissions |
| Database concurrency | Latest CI fails with TOURNAMENT_RULES_INVALID | Correct rules fixture and run real PostgreSQL checks |
| Funding | User reports preflight failure; no live transaction verified | Trace SDK path; live wallet funding and confirmed persistence |
| Private payout | Implementation and fixture tests only in this audit | Real recipient registration and successful confirmed transfer |
| Public demo | Deployment freshness not established | Read-only health and browser checks, then user-owned deployment |
| Submission evidence | strk20.json empty; user has no video or hashes yet | Verified mainnet hashes and accessible three-minute video |

## Acceptance and work order

1. Reproduce and repair CI against isolated PostgreSQL, including repeat-safe migrations, concurrency and worker recovery.
2. Compare the installed WalletAccountV6 implementation with current primary wallet guidance. Repair funding without adding custody or removing receipt/authorization checks.
3. Audit host, join, timing, sharing, audio and recovery paths with desktop/mobile browser tests. Repair supported paths, keep unsupported states explicit.
4. Run typecheck, lint, unit/integration tests, production build, browser journeys, deterministic proof and dependency audit. Record failures and actual results, not inferred passes.
5. User performs live wallet approvals, deployment and Git writes. Only verified public mainnet evidence may enter strk20.json. Record video after the working loop is verified.

No payout amount or performance tuning is part of this audit. Existing fixed-seed benchmark and held-out evaluation scripts remain unchanged; test success does not prove operator-blind privacy or economic agent superiority.
