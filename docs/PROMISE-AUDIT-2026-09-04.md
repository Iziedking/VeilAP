# Veil Arena: code and promise audit

Date: 4 September 2026. Audited application commit: `de45e1877cdf60f2e2070454855874a4b2845a39`.

## Verdict

**Not ready to claim the full promised experience or begin broad participant testing.** The existing build and regression suite pass, but targeted failure tests reproduce important privacy, persistence, scheduling, settlement, and replay defects. A passing build is not evidence that those promises hold.

The implementation has a useful foundation: strict declarative policy packages, encrypted tournament artifacts, owner-scoped storage, deterministic paired deals, signed receipts, and guarded reward operations. It currently implements a heads-up decision benchmark with a completed-match replay, not a street-by-street live poker game.

This is a source and executable-test audit, not an independent security certification. No production database, SSH service, wallet, KMS key, or blockchain transaction was modified or exercised. Existing production incidents were not forensically attributed to these defects.

## Evidence run

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run build` | Pass | TypeScript, ESLint, 211 active Vitest tests, and optimized Next build. Four optional database tests skipped in this invocation. |
| `npm run test:e2e` | 40/40 pass | Existing desktop and Pixel 7 browser journeys. |
| `npm run prove` | Pass | Deterministic replay, 8 paired deals / 16 receipts, seat swapping, transcript inclusion, tamper rejection, and raw-field omission. Not resistance to guessing private values. |
| `npm audit --json` | 0 reported vulnerabilities | Known dependency advisories at audit time; not a source-security guarantee. |
| All migrations, then all migrations again | Both pass | Repeat-safe migration on a disposable PostgreSQL 16 database. |
| PostgreSQL repository integration tests | 4/4 pass | Readiness, atomic nonce consumption, X identity uniqueness, and enrollment capacity/replacement/rollback. |
| Worker response parser tests | 4/4 pass | The response helper behaves as tested; does not establish worker liveness. |
| New service/database promise probes | **2 pass, 7 fail** | Failure scenarios below, including a real PostgreSQL concurrent-save reproduction. |
| New browser promise probes | **0 pass, 3 fail** | Wrong replay score, replay restart failure, and no recovery after a temporary request failure. |
| Typecheck after adding audit harness | Pass | Audit code compiles without changing application behavior. |
| Targeted ESLint on audit harness | Pass | No lint diagnostics in the three added test/config files. |
| Full Null Jack benchmark | Completed | 256 matches including controls; both development and held-out splits completed without execution failures. |

The new tests are opt-in diagnostics, not silently added to the existing release suite. Their nonzero exits are expected while these defects remain. Browser fixtures intercept only the test browser's API responses; engine scores come from the real engine. Synthetic database records exist only in the disposable audit database.

## Promise assessment

| Promise | Assessment |
| --- | --- |
| Save an agent independently of an open competition | Implemented, but concurrent first saves can make the saved package unreadable. |
| Keep saved agents across sessions | Sequential save and fresh-service retrieval pass; session-secret rotation breaks decryption. |
| Reject executable agent uploads | Strict declarative schema rejects unknown executable fields. This is constrained-data validation, not an antivirus guarantee. |
| Keep policies and private actions sealed | Policy bodies are omitted from public responses, but public action hashes reveal the entire small action space. |
| Automatically run queued competitions | Happy path exists; crashed-running jobs and persistent failures can stop progress. |
| Count down to an actual match start | Current timer represents earliest eligibility, not a reserved execution start. First match has no positive countdown. |
| Watch your agent's actual cards while it plays | Not implemented: owner card data becomes available after completion. |
| Replay the real result accurately | Receipts exist, but the displayed running score uses the wrong scoring model. |
| Pay the legitimate season winner | Mixed win-and-tie seasons can incorrectly block settlement. Real-wallet mainnet completion remains unverified here. |
| Null Jack is a strong champion | Benchmark evidence must be scoped to this decision engine and tested baselines; it does not establish superiority against unseen builder agents. |

## Priority findings

### F01 / P1: public action commitments are not hiding commitments

Evidence: `src/domain/arena/poker-engine.ts:448` and `:451` hash known agent IDs with one of four actions, without a secret nonce. The service audit recovered **8 of 8 private actions** from public receipts using only the four possible action values. The combined action hash is also enumerable; removing only the per-agent hashes is insufficient.

Impact: the advertised selective disclosure of only an authorized losing action does not hold. This does not demonstrate extraction of the whole uploaded policy, but it does disclose actions that the current language calls sealed.

The public `scoreDelta` at `poker-engine.ts:460` also reveals some actions through the asymmetric scoring rules. Salting hashes alone will not remove all behavioral leakage. Hashing a small known value is not encryption.

Repair: design a versioned receipt/disclosure contract with unpredictable private nonces and explicit allowable leakage. Test both individual and combined commitments and score-derived inference. Preserve old receipts with a legacy-privacy explanation; already published information cannot be made secret retroactively. Do not regenerate historical results or silently replace their commitments.

### F02 / P1: simultaneous first saves can corrupt the saved-agent record

Evidence: `src/server/arena/participant-agent-service.ts:74` reads the existing row before selecting a new ID and encrypting with that ID as authenticated context. `src/server/db/repositories.ts:1197` upserts the ciphertext on owner/agent conflict while retaining the existing row ID.

Reproduction: two real service saves against PostgreSQL were synchronized so both observed no existing package. Both saves returned successfully. The surviving row could be listed, but a fresh service could not open it: `PARTICIPANT_AGENT_PACKAGE_INVALID`.

Impact: double clicks, retries, or two tabs can produce an apparently saved but unusable agent. This is a confirmed possible failure, not proof of why this user's earlier agent disappeared.

Repair: make ID selection, encryption context, version selection, and persistence atomic. Return the actual committed record. Add concurrent first-save and concurrent replacement integration tests; the memory repository's different conflict behavior cannot substitute for PostgreSQL coverage.

### F03 / P1: worker ignores expired running matches

Evidence: `src/server/arena/arena-worker-service.ts:59` selects only failed or due scheduled matches. A running match is never offered for reclaim, even after its lease expires. The repository already has expired-lease claim logic at `src/server/db/repositories.ts:1678`.

Reproduction: an expired running match returned worker `idle`; the claim service was called zero times instead of once.

Impact: a restart or crash during execution can strand a competition indefinitely.

Repair: eligible expired-running reclamation, lease ownership checks, durable execution inputs, bounded retries, and restart tests. Source review also found terminal updates without an attempt/lease fence at `repositories.ts:1691`; stale completion must not overwrite a newer attempt. That stale-completion race was source-reviewed, not separately executed in this audit.

### F04 / P1: a persistent failure can starve every later competition

Evidence: `arena-worker-service.ts:43` orders locked seasons oldest first and `:51` returns on any non-idle result. Failed matches remain immediately eligible with no match-level retry budget or backoff.

Reproduction: three successive ticks selected only `season-a`, which always failed; healthy due `season-b` was never attempted.

Repair: per-match retry scheduling, bounded attempts, visible failed/dead-letter state, and fair selection across seasons. Add failure isolation tests. Do not fix this by repeatedly running one production tick or deleting old competitions.

### F05 / P1: replay score does not equal the recorded engine score

Evidence: `src/components/arena/match-spectator.tsx:76` counts hand winners instead of accumulating versioned score deltas. Engine v0.3 uses asymmetric gains/losses at `src/domain/arena/poker-engine.ts:393`. The frontend receipt shape also omits `scoreDelta`.

Reproduction: the real engine's completed LEFT score was **-4**; the browser displayed **2** after the last receipt.

Impact: the table can show an apparent tie or wrong leader while the canonical receipt says otherwise. This is one concrete explanation for misleading tie displays; it does not establish that every previously observed tie had this cause.

Repair: one version-aware scoring projection shared by receipts, table, leaderboard, and settlement. Keep legacy v0.2 replays compatible. Add final-score equality and intermediate-score assertions.

### F06 / P1: one tied match blocks a clear season winner's reward

Evidence: the winner calculation at `src/server/arena/arena-prize-pool-service.ts:222` returns `ARENA_WINNER_TIE` as soon as any individual match is tied. The leaderboard separately awards season points for wins and ties in `arena-match-service.ts:555`.

Reproduction: LEFT had one win and one tied match, making LEFT the clear season winner under the leaderboard rules. Real `prepareSettlement` returned `ARENA_WINNER_TIE`. The fixture used a synthetic funded pool and deliberately prohibited chain calls or signatures.

Repair: aggregate all completed matches using the immutable season scoring rules, then apply the documented final tie policy. A genuine overall tie must not be assigned an arbitrary winner. Test settlement and leaderboard agreement across mixed win/loss/tie seasons.

### F07 / P1 product gap: live poker is not the implemented execution model

Evidence: `src/server/arena/arena-match-service.ts:315` runs a complete sealed match before persisting its hand sequence. The owner view at `:607` refuses private-card replay data until completion. The browser fetches that view only for completed matches.

The engine at `src/domain/arena/poker-engine.ts:343` supplies the complete board, a fixed pot and a fixed call amount, and takes one policy decision per deal. It does not execute preflop/flop/turn/river betting rounds, evolving chip stacks, or a real-time sequence of player turns.

Impact: a live status label and card animation cannot satisfy the requested live-card-table promise. `docs/DEMO.md:87` correctly limits the current description to live competition status followed by replay, but the requested product goes beyond that.

Repair decision: either explicitly ship a decision benchmark with accurate live job status and verified replay, or implement an authoritative incremental poker engine/event log with per-owner private projections and reconnect/replay support. Do not disguise completed computation as live decisions. Duplicate seat-swapped deals also require a reveal-timing policy so one owner's first leg does not expose cards needed by a later leg.

### F08 / P2: session-secret rotation makes saved packages unreadable

Evidence: `src/server/arena/participant-agent-service.ts:28` derives the saved-agent encryption key directly from the session-signing secret. No key version or fallback is stored for this vault.

Reproduction: save with one secret, reconstruct the service with a rotated secret, then open: `PARTICIPANT_AGENT_PACKAGE_INVALID`.

Repair: separate session signing from versioned data encryption, provide a migration/rewrap path, and prove old-package readability during rotation. Do not rotate production keys blindly. Tournament artifact KMS encryption does not cover this separate saved-package implementation.

### F09 / P2: one temporary schedule failure stops browser updates

Evidence: `src/components/arena/match-spectator.tsx:297` schedules another poll only after success; its error branch does not retry.

Reproduction: the first schedule request returned 503, with all subsequent requests configured healthy. After eight seconds, the browser had made only one request.

Repair: bounded retry/backoff, explicit reconnecting state, stale-data indication, and cleanup on navigation. Test interruption during both queued and active states.

### F10 / P2: replay does not restart with one click after natural completion

Evidence: `match-spectator.tsx:519` resets the index but toggles the stale `playing` state to false.

Reproduction: wait for automatic completion, click Replay match once, and Pause replay never appears.

Repair: explicit replay state transitions. Test natural completion, manual pause, end seeking, restart, and navigation between matches.

### F11 / P2: countdown is eligibility, not a guaranteed start

Evidence: `src/domain/arena/match-schedule.ts:3` calculates creation time plus `(sequence - 1) * 10 seconds`. The first match starts at creation time. Later timestamps do not reflect actual worker availability or previous match duration.

Reproduction: sequence 1 has no positive pre-start window. Source review confirms the UI can remain ready indefinitely after its nominal timestamp.

Repair: distinguish waiting for capacity, reserved countdown, running, delayed, failed, and completed. Only promise a precise countdown when a healthy worker has reserved the job. Otherwise show eligibility/queue information honestly. Execution and UI must enforce the same schedule rules.

## Additional source-reviewed operational risks

These are concrete review findings, but were not individually reproduced as full production incidents:

- `scripts/arena-worker.mjs:60`: fetch has a shutdown abort signal but no request deadline. A hung request can halt future ticks.
- `docker-compose.prod.yml:76`: the worker has no functional healthcheck. Deployment waiting for containers/app health does not prove that matches progress.
- `.github/workflows/deploy.yml`: CI configures `DATABASE_URL`, not the optional integration suite's `TEST_DATABASE_URL`. Migration checks can pass while four real repository tests remain skipped.
- `src/app/api/champion/challenges/route.ts:17`: a new request ID per POST means client retries are not a stable idempotent challenge-creation operation.
- `src/app/api/projects/[projectId]/seasons/[seasonId]/join/route.ts:78`: automatic roster lock awaits the call but does not handle a returned failure. Enrollment can appear successful while the worker never sees a locked season.
- The current Dockerfile copies the worker response helper. The earlier missing-helper packaging defect is not still present in this audited commit. A fresh runtime image was not built in this audit.

## Null Jack benchmark

The full existing benchmark was run without changing the champion policy, opponent policies, engine, or seed set. It uses 24 development and 24 held-out seed labels, five fixed baselines, 12 paired deals per match, and eight same-policy controls in each split.

Development results:

| Opponent | Null Jack W/L/T | Mean score difference |
| --- | --- | --- |
| Always Fold | 24 / 0 / 0 | +12.04 |
| Always Call | 21 / 2 / 1 | +10.54 |
| Always Raise | 24 / 0 / 0 | +41.63 |
| Value Bot | 15 / 4 / 5 | +1.71 |
| Null Jack v1 | 15 / 5 / 4 | +3.08 |
| Same-policy control | 0 / 0 / 8 | 0.00 |

Held-out results:

| Opponent | Null Jack W/L/T | Mean score difference |
| --- | --- | --- |
| Always Fold | 24 / 0 / 0 | +10.67 |
| Always Call | 20 / 4 / 0 | +6.17 |
| Always Raise | 24 / 0 / 0 | +34.75 |
| Value Bot | 14 / 4 / 6 | +1.50 |
| Null Jack v1 | 12 / 2 / 10 | +1.71 |
| Same-policy control | 0 / 0 / 8 | 0.00 |

Across the five held-out baselines: **94 wins, 14 losses, 12 ties in 120 matches** (78.3% outright wins). This aggregate is heavily influenced by simple always-fold/raise opponents; the individual baseline rows are more informative. All 256 matches, including 16 controls across both splits, completed with zero execution failures.

All development and held-out rows reported zero matches in which every hand tied. Identical-policy paired matches correctly tied overall despite non-tied individual hands. These results refute an unconditional claim that the current engine always ties; they do not fix the replay-score defect.

Limitations: these are fixed, repository-visible seed sets and a small number of simple opponents, not a fresh blind tournament. Null Jack's policy is itself visible in the source. Its performance here does not establish an unbeatable agent, optimal poker play, or strength against arbitrary frontier-model strategies. Do not tune against the held-out results and keep describing the same set as unseen.

## Repair order and release gates

1. Privacy receipt design and saved-package atomicity/key lifecycle. Prevent new disclosure or unreadable saves before adding users.
2. Worker recovery, failure isolation, request deadlines, durable seeds, lease fencing, and honest queue states. Test process failure, not just successful ticks.
3. Shared version-aware scoring and winner selection, then replay/reconnect fixes. Table, canonical receipt, leaderboard, and reward recipient must agree.
4. Decide and implement the live-game scope. Retain existing games as historical receipts; do not recalculate old results under new engine rules. If detailed events were never recorded, label the replay as a result replay rather than inventing action timing.
5. Promote repaired regression probes into normal CI, enable real PostgreSQL tests, and add a worker runtime smoke/restart check. Re-run the full audit after fixes.
6. Only then proceed with user-owned multi-account and real-wallet validation.

Suggested acceptance gate: 20 consecutive challenge journeys complete without manual worker intervention; two simultaneous saves remain readable; a worker restart recovers its job; a poison job does not block another account; a temporary browser disconnect recovers automatically; canonical and displayed scores agree; and no unauthorized account can obtain another owner's package or private cards. This is a proposed gate, not a result already achieved.

## Human/production validation after repairs

- Use separate wallet accounts and browser profiles. Save before any event exists; refresh and sign out/in; verify the same package is available only to its owner.
- Join from the saved package and confirm account/agent/history navigation. Check X picture load, expired X authorization, and fallback behavior without exposing private account metadata publicly.
- Start two competitions concurrently. Watch the actual start, leave, reconnect, and replay after completion. Test a viewer without ownership.
- Check own-card visibility and opponent-card secrecy at every permitted phase, including paired seat swaps. Confirm rules do not allow timing-based information leakage.
- Verify historical entries remain accessible and immutable after agent replacement or engine upgrade.
- Check desktop/mobile dark-mode contrast, keyboard controls, mute persistence, actual audible effects, background-music suppression in the arena, and browser autoplay restrictions. Automated DOM tests do not prove that sound is audible on the user's hardware.
- With explicit owner authorization, test a funded season and real finalized STRK20 settlement. Verify correct winner, amount, recipient, retry safety, and private/public views. Unit fixtures are not proof of mainnet success.
- Exercise backup/restore and key rotation in staging before production. Do not delete old competitions or volumes to make the interface appear clean.

`strk20.json` has empty transaction/contract evidence arrays at this commit. That is missing submission evidence, not proof that the user has never made a real transaction. Mainnet, wallet-extension, X provider, production KMS/IAM, multi-account isolation at scale, and restore testing remain external gates.

## Reproducing the new diagnostics

Use only a disposable local PostgreSQL 16 database named `veil_promise_audit` on `127.0.0.1`. Apply migrations using that database's `DATABASE_URL`, then set `TEST_DATABASE_URL` to the same disposable target for the service audit. The script rejects other hostnames/database names. Do not substitute production connection details.

```text
npx tsx scripts/audit-promises.ts
npx playwright test --config tests/audit/playwright.config.ts
```

The browser suite uses the base Playwright web-server configuration. Failure traces and error contexts are generated under `test-results/promise-audit/`. The diagnostic suite is intentionally red until the application is repaired; do not weaken assertions to make it green.

## Change boundary

Only this report, `scripts/audit-promises.ts`, and `tests/audit/` were added. No application fix, schema change, dependency update, Git commit/push, deployment, production migration, wallet signature, or transfer was performed. Existing `.gitignore` and `ui-artifacts/` changes belong to the user and were preserved.

Cleanup: the exact container `veil-arena-promise-audit-20260904` was verified by name, ID, audit label, local port 55449, and database name, then stopped and removed with its anonymous database volume. Only synthetic audit data was deleted; it is not recoverable. No production or unrelated local database was removed.

The build-standard review separated successful-path tests from promise/failure tests and kept real-wallet and production evidence distinct from local fixtures. That distinction is why the verdict is a failed promise audit despite passing ordinary release checks.
