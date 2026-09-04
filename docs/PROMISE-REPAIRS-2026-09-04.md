# Promise repair plan and evidence

Date: 2026-09-04. Original audit and historical results remain unchanged.

## Discipline

Humanizer writing: plain, accurate language in code and product states. Evidence-led research: inspect the installed dependencies and real failures before changing behavior. Pre-coding gates: preserve data, reproduce failures, then verify each focused stage. Clean code: explicit boundaries and tests for concurrency, disclosure, and rewards.

## Baseline reproduced before application changes

Unchanged scripts/audit-promises.ts against disposable PostgreSQL 16: 2 passed, 7 failed. Unchanged tests/audit browser suite: all 3 failed, including engine LEFT -4 versus displayed 2. No production connections or wallet operations. Disposable container: veil-arena-repair-audit-20260904, local port 55449, database veil_promise_audit. Existing .gitignore and ui-artifacts changes preserved.

## Focused stages

1. Serialize saved-package changes in PostgreSQL before choosing identity, version and encryption context. Use independent versioned vault keys, retained legacy decryption keys, and explicit owner-scoped rewrap. Introduce version 2 privacy receipts without changing engine scoring.
2. Recover expired execution leases, fence stale attempts, preserve execution seed, isolate poison jobs with bounded backoff, and expose honest queue states. Add worker request deadlines and health evidence.
3. Share version-aware score and season-point projections across replay, leaderboard and reward preparation. Preserve legacy scoring and refuse genuine season ties.
4. Recover browser requests, abort on navigation, and make replay transitions explicit.

## Privacy decision

New receipt format v2 uses domain-separated nonces derived from the private 256-bit server match seed. Commitments bind match, hand, seat and agent. Public receipts omit per-hand score deltas because v0.3 deltas reveal actions directly. The replay shows the canonical final score at the end and labels intermediate scores as private. Final aggregate scores and hand winners remain public and can permit behavioral inference, especially in short matches. This is not action noninterference or operator-blind privacy. Legacy receipts and signatures are never regenerated; their enumerable commitments remain disclosed historical data.

The existing private random seed is reused as nonce source to retain deterministic reconstruction without another key or stored secret. Never use caller-selected or low-entropy seeds in production. Test seeds are fixtures only.

## Actual live gameplay boundary

This repair retains completed decision-benchmark execution and result replay. A real live game requires an authoritative incremental state machine for streets, legal bets and stacks; durable ordered events and checkpoints; fenced execution ownership; per-owner authenticated projections; reconnect cursors with snapshot reconciliation; and recorded timestamps. A reveal gate must withhold cards until all paired legs are irrevocably complete, otherwise seat swapping exposes a later hand. Trusted workers and privileged operators still see plaintext. Streams should carry only the requesting owner's permitted view. This materially expands the engine and requires a separate reviewed specification, capacity budget and failure tests before implementation.

## Sources and implementation grounding

[PostgreSQL 16 explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html). [Node crypto](https://nodejs.org/api/crypto.html). Reviewed 2026-09-04. Existing Drizzle 0.45.2 transaction and query patterns and AES-256-GCM envelope implementation are the integration seams. Use the existing PostgreSQL repository rather than adding a queue vendor.

## Verification

- Reproduced baseline: 2/9 service probes passed and 0/3 browser probes passed before application edits.
- Repaired service audit: 10/10 passed on disposable PostgreSQL 16, including concurrent first saves and concurrent replacements.
- Migration application and journal replay passed with all 23 migrations, including additive 0021 and 0022. No production migration ran.
- Worker runtime smoke: timeout recovery, process restart and health heartbeat passed.
- Transcript proof: 8 paired deals / 16 receipts passed deterministic replay, inclusion and tamper checks.
- Full optimized Next build passed, including TypeScript, lint and all 229 tests present at that build's test phase. The final KMS cancellation addition is checked in the subsequent complete check run.
- Final complete check run: TypeScript and ESLint passed; 53 test files and 230 tests passed with PostgreSQL enabled, zero skips.
- Full browser suite: 58/58 passed across desktop and Pixel 7, including all 18 audit cases (nine behaviors on each viewport), navigation and completed-private-replay logout recovery.
- Final patch whitespace check passed; only normal Windows line-ending notices.
- Full unchanged champion benchmark: 256 matches, zero failures, all development/held-out rows exactly match the original audit. Held-out W/L/T: fold 24/0/0, call 20/4/0, raise 24/0/0, Value Bot 14/4/6, Null Jack v1 12/2/10, same-policy control 0/0/8. No policy or seed tuning.
- Compose configuration validation passed; no image was deployed.

During final verification, the new PostgreSQL recovery test exceeded its unchanged five-second limit twice under default full-suite process contention, then passed isolated. Limiting Vitest to four worker processes produced a complete 229/229 pass in 13.4 seconds. Concurrent requests within the database tests and every assertion/deadline were preserved. This configuration change prevents test-runner oversubscription; it is not a relaxed recovery gate.

## UI repair brief

The participant wants to know whether their saved agent is queued, executing, recovering or complete, then inspect a recorded result. Preserve existing tokens, table layout, controls and responsive structure. Use status text and an aria-live recovery notice, not motion, to communicate freshness. Loading precedes a first snapshot; transient errors retain the last public snapshot marked stale and clear owner-only data. Authentication failure clears private data. Retry automatically with capped delay and a request deadline; abort on navigation. Replay buttons pause, resume, seek and restart explicitly, with existing accessible names and keyboard/touch controls. New v2 receipts label intermediate score as private; historical v0.2/v0.3 scoring stays version-aware. Reject fake countdown reservations and invented live action timing. Sources: reproduced Playwright failures, existing spectator and arena-types, Next 16.3.3 installed route docs and React state/effect conventions reviewed 2026-09-04.

## Finding-by-finding evidence

| Audit item | Repair and regression evidence | Remaining boundary |
| --- | --- | --- |
| F01 private-action leakage | Receipt v2 uses per-context private nonces for individual and combined commitments and hides per-hand deltas. promise-privacy.test.ts exercises enumeration, nonce binding, legacy equivalence and deliberate delta omission; test:promises passes the original disclosure probe. | Final aggregates and winners still permit inference. Legacy published values cannot be retracted. |
| F02 simultaneous saves | Owner/agent transaction lock covers ID, version, AAD encryption and commit. PostgreSQL audit proves concurrent first saves and replacements remain decryptable from a fresh service with distinct versions. Raw repository writes reject identity conflicts. | Already-corrupt historical packages need a valid backup or original owner package. |
| F03 crashed workers | Expired leases are eligible; attempts fence both receipt publication and terminal updates; the encrypted execution seed survives reclaim. worker-recovery.test.ts exercises simultaneous PostgreSQL claims, exact lease expiry, stale writes and seed reuse. arena-season-service.test.ts injects a crash after final-attempt receipt publication and proves reconciliation preserves the receipt. | HTTP cancellation does not terminate synchronous computation; expiry prevents authoritative late publication. |
| F04 starvation | Fair selection uses durable last-start times; a failed season does not end the scan; each match has backoff and at most three attempts. Original repeated poison-season probe passes; repository tests cover retry eligibility and exhaustion. | Capacity is finite; exhausted jobs remain visible for investigation. |
| F05 replay scoring | Shared scoring.ts projects v0.2 wins, legacy v0.3 deltas and exact canonical final aggregates. Browser tests compare real engine output to both seats, including the original -4 versus 2 failure, and verify intermediate legacy deltas. | New private receipt format deliberately has no public intermediate score. |
| F06 settlement | Leaderboard and settlement share three points per win, one per tie, zero per loss for supported v0.2/v0.3 template rules. Mixed win/tie settlement probe passes. scoring.test.ts covers mixed results and genuine final ties; equal points never use display ordering to choose a recipient. | Funded fixtures are not evidence of real-wallet settlement. Existing receipts are not recalculated. |
| F07 live-game gap | Explicitly retained the decision benchmark; status and result-replay labels replace live-decision claims. Required incremental architecture and paired-card reveal policy are documented above before any engine expansion. | Actual street-by-street live poker remains outside this repair. No recorded action timing is invented. |
| F08 key lifecycle | Independent versioned key ring, retained legacy readers and owner-authorized atomic rewrap. Unit and PostgreSQL probes preserve readability across fresh services, session-secret change and data-key rotation. | Production configuration, backups and staged rewrap are owner-owned rollout steps. |
| F09 reconnect | Bounded requests, capped retry delay, explicit reconnecting state, last-public-snapshot retention and private-state clearing; cleanup aborts navigation requests. Browser probes interrupt initial, scheduled and running requests. | External provider and real wallet-session behavior require manual acceptance. |
| F10 controls | Explicit pause, seek and restart transitions, state reset for changed match route. Browser probes cover natural completion, pause, end seek, one-click restart and navigation to another match. | Audible effects/autoplay require hardware testing. |
| F11 countdown | Shared eligibility rule delays first sequence by ten seconds; server refuses an early run. UI distinguishes eligibility, capacity, execution, recovery, retry and failure. Service, repository and browser tests cover the states. | No reservation or exact execution-start promise. |

## Additional operational findings

- Worker deadline and runtime: real local HTTP smoke server deliberately hangs the first response, then verifies retry, a second worker process, and fresh health output. Worker healthcheck is copied into the runtime image and wired into Compose. Compose configuration validates. No fresh production runtime image or deployment was performed.
- CI: both DATABASE_URL and TEST_DATABASE_URL point to the disposable CI PostgreSQL service; migrations precede checks. Promise probes, worker runtime smoke and desktop/mobile audit tests are normal release gates. Local PostgreSQL tests ran rather than being skipped.
- Champion challenge retries: client retains one request key through failures and refresh; project creation is transactional and season/champion enrollment keys are stable. champion-route.test.ts exercises concurrent POSTs plus retry against actual memory service implementations and rejects a missing key.
- Automatic roster lock: join-lock-route.test.ts confirms a failed lock returns an explicit failure with enrollment-saved context. A successful enrollment is not presented as successful automatic scheduling.
- Historical data and unrelated changes: no production data was connected or rewritten. Original audit report, benchmark policy/seed set, old receipt rules, .gitignore and ui-artifacts were preserved. Two additive migrations add nullable fields; owner rewrap changes ciphertext only when explicitly invoked.

## Test integrity

The baseline diagnostics ran unchanged before application edits. The repaired audit fixture now supplies the required independent synthetic vault key ring, and adds a concurrent-replacement probe; its original failure assertions remain. Legacy scoring tests explicitly request receipt format 1 so historical deltas remain tested. The reward test's synthetic unsupported engine label was corrected to the real v0.2 version without removing its payout assertions. First-match tests now assert early refusal before advancing their clock. No benchmark opponent, seed or score expectation was tuned.

## Multi-account production acceptance checklist

These are unperformed acceptance gates for the owner after a reviewed release. Use separate wallet accounts and browser profiles; keep an evidence log with account alias, competition/match ID, timestamp and outcome, excluding secrets.

- [ ] Before rollout: restore a backup into staging; apply migrations 0021/0022 there; verify old agent IDs/versions, receipt signatures/digests and results against the backup. Configure the independent participant vault ring and retained legacy keys. Verify readiness and fresh worker heartbeats.
- [ ] Account A saves a package before any competition exists. Refresh, restart the browser, sign out/in and verify the same commitment. Account B and an anonymous profile cannot list, open or rewrap A's package.
- [ ] In two A tabs, simultaneously first-save the same agent and then replace it twice. Both successful responses identify the committed stable ID; versions advance distinctly; a fresh login can still open the final package. Confirm prior tournament artifacts and entry history remain unchanged.
- [ ] Complete wallet/X verification separately for A and B. Check expired authorization, rejected wallet prompt, profile-image fallback, logout and account switching. Public responses must not gain owner identity or package contents.
- [ ] Start 20 consecutive champion journeys with real saved packages. Double-click/retry one creation after a dropped response and refresh: one operation creates one challenge. Every journey completes without manual worker intervention. Record canonical result and queue recovery evidence.
- [ ] Start A and B competitions concurrently. Check positive eligibility, capacity waiting and actual execution separately; a later eligible season must progress. In staging, inject a poison job and kill a worker after claim and after receipt publication. Verify eventual recovery, unchanged seed/result and exactly one terminal receipt; exhausted jobs remain visible.
- [ ] Disconnect each browser during queued and executing states, then reconnect without reload. Check the reconnecting indicator and automatic recovery. Logout or switch accounts while private replay is visible; no old owner's private view may remain. Navigate between matches and verify controls start at the correct receipt.
- [ ] At completion, compare both displayed final scores, signed receipt scores, competition leaderboard and reward-preparation winner. Include a mixed win/tie season and a genuine overall tie. The latter must not choose an arbitrary winner.
- [ ] Inspect anonymous, A-owner and B-owner responses at each allowed phase. Own cards appear only after the entire match completes. Confirm and disclose that duplicate seat swaps permit post-completion opponent-card inference; no permanent-secrecy claim is acceptable.
- [ ] On desktop and mobile, check keyboard/touch controls, contrast, pause/resume/end seek/restart, mute persistence, audible effects, background music suppression and autoplay restrictions. Automated DOM tests do not prove audible output.
- [ ] In staging, retain the old key, add a new vault key, switch currentKeyId, rewrap under each owner, and reopen with fresh services. Verify unchanged IDs/versions/commitments and recover a retained backup. Test session-signing rotation separately. Do not discard old keys until the backup recovery policy permits it.
- [ ] Separately authorize any funded/mainnet exercise. Verify sponsor, winner, recipient, amount, finality, retry safety and public/private settlement views with the real wallet and STRK20 provider. No signature or transaction was performed during this repair.

Broad participant acceptance requires all relevant gates above. A local green build does not certify production privacy, provider configuration, wallet execution or operational recovery at scale.

Key-provider timeout grounding: KMS Describe/Encrypt/Decrypt calls also receive a ten-second abort signal so an unavailable request does not indefinitely retain a worker operation. Tested cancellation with an injected KMS client; no paid provider call. [AWS SDK v3 abort-signal documentation](https://github.com/aws/aws-sdk-js-v3/blob/main/README.md#abort-controller), reviewed 2026-09-04.

## Completion boundary

All four repair stages are implemented and locally verified. F07 is resolved by an explicit benchmark scope and documented future architecture, not by implementing live streets. Production acceptance remains unchecked above. No commit, push, deployment, production migration, production secret rotation or wallet transaction was performed.

Cleanup: verified the disposable container ID d2813bce47053c6f444cb26c86f006f2641ec6c2ba757bd7e967d52f33e8fc69, label veil.audit=promise-repair-20260904, local port 55449 and 23 migration records, then removed only that container and its anonymous volume. Its synthetic test data is not recoverable. Existing production and unrelated local databases were not touched.
