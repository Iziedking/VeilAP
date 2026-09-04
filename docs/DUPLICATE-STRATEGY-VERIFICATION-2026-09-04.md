# Duplicate strategy repair verification

## Behavior

New competitions commit template version 2 with reject_exact. Two accounts can save the same package privately. Only one can hold an active entry with that normalized engine/policy in the same competition. Renaming the package does not change eligibility. An owner can retain their own policy in a replacement; a policy leaves the uniqueness set when that entry is replaced. Old rules and results stay intact.

This rule is not personhood verification or a cheating verdict. Semantic policy edits can evade exact structural matching. There is no fuzzy auto-ban. The private database index reveals within-season equality to database readers, and an authorized duplicate refusal reveals a membership bit. No digest or matching account is returned.

## Reproduction and evidence

Before application changes, the new enrollment regression submitted renamed copies concurrently from two owners. It failed because both were accepted: expected one success, received two. The failure was observed in src/server/arena/arena-enrollment-service.test.ts.

The unchanged champion benchmark completed all 256 matches with zero failures and exactly the previous results:

| Opponent | Development W/L/T | Held-out W/L/T |
| --- | --- | --- |
| Always Fold | 24/0/0 | 24/0/0 |
| Always Call | 21/2/1 | 20/4/0 |
| Always Raise | 24/0/0 | 24/0/0 |
| Value Bot | 15/4/5 | 14/4/6 |
| Null Jack v1 | 15/5/4 | 12/2/10 |
| Same-policy control | 0/0/8 | 0/0/8 |

An initial full check hit four 5-second PostgreSQL timeouts while the benchmark was running, affecting both new tests and existing draft tests. No assertions or timeout limits were relaxed. The isolated run passed all new regressions and identified a separate existing capacity fixture whose policy duplicated an active entry. Both memory and PostgreSQL capacity fixtures now use distinct policies; their original capacity and rollback assertions remain unchanged. Final unit/integration verification passed: 57 Vitest files, 261 tests, zero skips, including real PostgreSQL. TypeScript and ESLint passed. The full npm run build completed successfully, including the optimized Next.js build. All 74 Playwright tests passed, including the 18 prior spectator audit journeys and the new desktop/mobile duplicate refusal. Browser responses use real enrollment/vault services behind request interception; wallet/X authentication is a fixture, so this does not replace production multi-account testing. Visual review prompted a final notice-placement adjustment. The final optimized build and both focused desktop/mobile browser tests passed again; screenshots were reviewed and neither viewport overflows.

All 10 original promise probes passed against the disposable PostgreSQL database. Worker runtime smoke passed timeout recovery, process restart and heartbeat checks. The receipt proof passed deterministic replay, transcript inclusion, tamper refusal and private-field omission for 8 paired deals / 16 public hand receipts.

| Property | Regression evidence |
| --- | --- |
| Renamed copies and simultaneous first entries | Enrollment regression plus memory/PostgreSQL duplicate-strategy suites |
| Concurrent replacement and rejected-update rollback | Exactly one winning update; loser retains its entry, history and artifacts |
| Cross-season separation and legacy admission | Same policy in a separate season; duplicate policies allowed under unchanged version 1 rules |
| Private library copies | Identical package saved independently by two owners |
| System, invitation and operator paths | Duplicate refusal through each service path |
| Missing fingerprint and direct storage bypass | Repository guard, real unique-index conflict and raw SQL trigger refusal |
| Populated migration | Original fields match before/after; no new fingerprint backfill; whole probe transaction rolled back |
| Private projections and key lifecycle | No fingerprint in enrollment/schedule projections; domain separation and unchanged-key rewrapping tests |

Disposable PostgreSQL 16: container veil-strategy-audit-20260904, bound to 127.0.0.1:55451, database veil_promise_audit. All 25 migrations applied successfully twice. Direct inspection confirmed the index and enabled trigger. No production connection was used. The container ID and disposal label were verified, then only that container and its temporary volume were removed. The unrelated nock PostgreSQL and Redis containers remain running.

## Migration and key review before production testing

Review 0024_competition_strategy_uniqueness.sql in addition to earlier 0021, 0022 and onboarding 0023. It adds one nullable column, one unique index and one required-value trigger. It contains no updates/deletes/backfill of historical records. The index treats legacy nulls as distinct. A populated legacy-table upgrade regression checks every original entry field and confirms all new values remain null.

The normal index build can block writes briefly. Review production row count and plan a maintenance window. Apply the additive migration before the compatible application build, then check protected readiness for the column, index and enabled trigger. These production actions were not performed by the agent.

There is no new environment variable or secret for this feature. The competition index derives from the existing project data key, independently of VEILAP_PARTICIPANT_VAULT_KEYS and the session secret. Review the vault configuration using AGENT-ONBOARDING-VERIFICATION-2026-09-04.md: use a distinct current key ID and random 32-byte key, retain prior keys while existing ciphertext uses them, and ensure all relevant server processes agree. Never print secret values or put them in Git.

Rewrapping an unchanged project data key preserves comparisons. Changing its actual bytes requires a separately designed coordinated re-encryption/index rebuild with admission paused. Do not perform that during this rollout. No real KMS rotation was tested or performed; the wrapping contract was tested with the preview provider.

Rollback must preserve version 2 rules and their commitments. Pause new competition creation and admission, retain the additive schema, and use a compatible repair build. Do not make old binaries accept version 2 by deleting the field or rewriting old results.

## Multi-account production acceptance checklist

Use separate browser profiles for accounts A and B, each with its own wallet and X account. These checks are pending and belong to the owner.

- [ ] Capture the existing agents, entry versions, rule commitments, results and receipt IDs you want to preserve.
- [ ] Complete the migration and vault-key review above. Check worker/API health and protected readiness.
- [ ] Create an exhibition competition with no funded reward and verify the exact-strategy rule is visible before entry and in the competition room.
- [ ] A and B each save the identical file through My agents. Both private saves succeed and neither account can read the other's library or drafts.
- [ ] A enters. B renames only agentId/displayName and attempts entry in the same competition. B receives the duplicate-strategy explanation; their saved agent remains intact.
- [ ] In a fresh competition, submit renamed copies from A and B simultaneously. Exactly one entry appears. Reload both browsers; counts and owner states agree.
- [ ] B enters a policy with a substantive different rule or fallback. Where updates are permitted, try replacing it with A's policy. Refusal leaves B's prior entry/version/history intact.
- [ ] Replace A's entry with a different policy, then confirm another owner can use the retired policy. Confirm A's historical artifact and receipts remain available.
- [ ] Attempt the copy through the coding-agent upload flow and an invitation. Upload/review/save remain private; competition admission applies the same rule.
- [ ] Exercise operator registration of two already sealed copies and the champion challenge copy case. The second exact strategy must be refused.
- [ ] Choose a different competition using a distinct package ID where project-level artifact identity requires it. The same policy can compete there without cross-competition matching.
- [ ] Review entry/schedule responses and displayed errors: no private strategy fingerprint, package policy or matching-account identifier. Owner-authorized library review may return that owner’s own package. Public scores and commitments retain their existing behavior.
- [ ] Open an existing version 1 competition and historical results. Its rules, entry behavior, receipts and scores remain unchanged.
- [ ] Continue the full promise-repair production checklist in PROMISE-REPAIRS-2026-09-04.md and the onboarding checklist. Reconnection, replay, worker recovery, scoring and payout review remain release gates.

No wallet transaction, funded reward, secret rotation, production migration, deployment or Git write was performed for this repair. This work adds no live gameplay engine and makes no live-play claim.

## User-only Git commands

Run from the veilap repository after reviewing the diff. These paths exclude the unrelated .gitignore and ui-artifacts changes.

```powershell
git diff --check
git diff --stat
git add -- README.md public/AGENT.md docs/PRIVACY.md docs/OPERATIONS.md docs/DUPLICATE-STRATEGY-PLAN-2026-09-04.md docs/DUPLICATE-STRATEGY-VERIFICATION-2026-09-04.md drizzle/0024_competition_strategy_uniqueness.sql drizzle/meta/_journal.json src/app/api/agent-submissions/route.ts src/components/arena/arena-types.ts src/components/arena/competition-room.tsx src/components/veil-arena-console.tsx src/components/veil-arena-play.tsx src/domain/arena/tournament-rules.ts src/domain/arena/tournament-rules.test.ts src/server/arena/arena-enrollment-service.ts src/server/arena/arena-enrollment-service.test.ts src/server/arena/arena-season-service.ts src/server/arena/arena-readiness-database.ts src/server/arena/strategy-fingerprint.ts src/server/arena/strategy-fingerprint.test.ts src/server/arena/duplicate-strategy.test.ts src/server/db/repositories.ts src/server/db/repositories.postgres.test.ts src/server/db/schema.ts src/server/http/service-response.ts tests/e2e/duplicate-strategy.spec.ts
git diff --cached --stat
git diff --cached
git commit -m "Prevent exact duplicate strategies in new competitions"
```

No push command is included because pushing the deployment branch can trigger production changes.
