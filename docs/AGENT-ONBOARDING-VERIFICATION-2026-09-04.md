# Agent onboarding verification, 2026-09-04

## Implemented flow

My agents → Add agent → Send from coding agent / Upload file → Review → Save → Choose competition.

The library supports saved packages before any competition exists. A coding agent receives one copyable prompt with a narrow upload grant. Direct file selection, drag/drop, and advanced JSON paste converge on the same durable draft. The owner reviews metadata and explicitly saves. Competition entry remains a separate wallet/X-gated action. When a saved agent is selected, entry hides the duplicate upload and save controls.

The research and locked design are in [the research brief](AGENT-ONBOARDING-RESEARCH-2026-09-04.md). The earlier promise repairs and every original audit finding remain documented in [the unchanged repair evidence](PROMISE-REPAIRS-2026-09-04.md). This stage does not expand the engine or call completed computation live gameplay.

## Evidence by requirement

| Requirement | Repair and verification |
| --- | --- |
| Two clear upload methods | Dedicated Add agent page; complete coding prompt or file picker/drop; raw JSON is under Advanced. Desktop/mobile browser journeys cover both. |
| One review and explicit save | Both methods create a draft; tests prove the library stays empty until owner save. Review shows identity, engine, rule count, privacy and optional fingerprint. |
| No open season required | Service has no season dependency; browser save completes with an empty competition list and no X identity. |
| Narrow coding-agent authority | Grant is a random 256-bit value, only its domain-separated digest is stored. HTTP tests prove bearer upload works without a session while owner list/review/save/create reject that same bearer without wallet authentication. |
| Privacy | AES-GCM ciphertext is bound to the draft ID. Review and list expose metadata only. Tests reject executable/unknown fields and oversized bodies; stored records do not contain policy text; browser local storage does not contain grant or package. |
| Refresh and lost responses | Owner draft URLs survive refresh; My agents lists pending/ready drafts. Identical upload/save retries are idempotent. Browser test drops a successful save response, retries, and observes one version. Browser reads and uploads have a 20-second timeout and stale read responses are fenced. |
| Concurrent save correctness | Memory and PostgreSQL race four uploads and four finalizations; one stable saved agent/version results. The draft row and existing owner/agent advisory lock are held in the same database transaction. |
| Transaction rollback | Real PostgreSQL test forces the draft write to fail after the library insert. Both writes roll back: the draft stays ready and the library remains empty. |
| Explicit, safe updates | New-agent collisions require Update. A draft captures the target's original version and commitment. Two simultaneous updates permit one winner; stale finalization fails. A creation retry never refreshes the original snapshot. Stable library ID is preserved. |
| Key rotation | A draft uploaded with the old vault key finalizes with the new key after session-signing rotation. Removing the retained key refuses save and leaves the draft intact; retaining it permits save and a fresh service can decrypt the result with only the new key. |
| Expiry, revocation and resource bounds | One-hour expiry, five active drafts, twenty creations per owner per rolling day. Concurrency tests verify active cap; sequential revoke/create verifies rolling cap. Save/revoke clear ciphertext. Expired access is rejected. |
| History and account isolation | Wrong-owner review/save return not found. Library remains usable when competition history fails. Library changes never write tournament artifacts, entry history, receipts or scores. Existing direct APIs and legacy claim links remain compatible. |
| Accessibility | New review journey asserts no horizontal overflow and all visible links/buttons/summaries at least 44px high. The first run found smaller shared header targets; scoped profile styles repair those controls. |

## Verification runs

- New adversarial tests were written before the draft service existed and initially failed to import it. A later expiry test caught incorrect error precedence; implementation was corrected.
- Final npm run build passes: TypeScript, ESLint, 55 Vitest files / 247 tests / zero skips, production compilation and 35 generated static pages. Dynamic onboarding routes are present in the build output.
- Disposable PostgreSQL 16 on 127.0.0.1:55450 applied the migration journal twice. The database contains 24 journal records, including 0023. No production database was used.
- All ten original promise probes pass against real services and the disposable database.
- Worker smoke passes timeout recovery, process restart and health heartbeat.
- Proof script passes deterministic replay, inclusion, tamper rejection and public omission of hole cards, rules and raw seed: eight paired deals, sixteen public receipts.
- Full unchanged champion benchmark passes all 256 matches with zero failures. Held-out W/L/T: Fold 24/0/0; Call 20/4/0; Raise 24/0/0; Value 14/4/6; Null Jack v1 12/2/10; same-policy control 0/0/8. Policy, baseline opponents, seed set and engine files are unchanged.
- Initial browser failures included an ambiguous locator matching Next's hidden route announcer. Locators were scoped to the main content; assertions were retained. The full first pass reached 71/72, with one remaining 40px desktop theme control; its height was corrected.

Browser tests use the real draft and vault services behind intercepted browser responses; wallet authentication is a fixture. Separate route tests cover authorization and separate PostgreSQL tests cover durable transactions. This is local evidence, not a claim of production wallet, X OAuth or third-party coding-provider verification.

## Migration and configuration review

This stage adds **one more additive migration, 0023**, after the earlier 0021/0022 repairs. It creates participant_agent_drafts and an owner/creation index. It does not alter saved agents, historical receipts, entry versions or scores. Inspect its CHECK constraints: supported status values, and ciphertext present exactly for ready drafts. Readiness includes the new table and critical fields. Deploying this code before applying its migration fails the readiness gate.

No additional secret is required. Draft encryption uses the already introduced independent VEILAP_PARTICIPANT_VAULT_KEYS ring. Keep it separate from VEILAP_SESSION_SECRET and the wallet fingerprint pepper. Retain previous vault keys while saved packages, active drafts or recoverable backups need them. Missing retained keys return DRAFT_KEY_UNAVAILABLE without consuming the draft. No production secret was generated, printed or rotated.

Expiry denies access at one hour. Save and revoke clear ciphertext immediately. Physical cleanup removes this owner's records older than 24 hours on their next draft creation; dormant expired records can remain encrypted until that cleanup. Backups retain data under the existing backup policy. Do not log Authorization headers, copied prompts or upload bodies. Per-owner caps are not a global anti-Sybil or DDoS guarantee.

## Multi-account production checklist

These are owner-run acceptance gates after review and release. They remain unperformed here.

- [ ] Review migrations 0021/0022 and new 0023 against a restored staging backup. Apply the journal twice in staging. Compare existing agent IDs/versions, old receipt digests/signatures, entry history and scores with the backup.
- [ ] Verify the independent vault ring and retained legacy keys in the server-only configuration. Keep session signing and fingerprint pepper separate. Readiness must pass before production testing.
- [ ] Account A opens My agents with no open competition and no X identity, uploads a real package, reviews and saves. Reload and sign out/in; verify the same ID, version and commitment.
- [ ] Account B and an anonymous browser cannot list, review, save, revoke or open A's draft/package. Switch accounts while the page is open and return to it; A's review must not remain visible.
- [ ] A creates a coding-agent prompt. Use it with the actual chosen coding service. Confirm upload succeeds without cookies or wallet credentials, review does not save automatically, and only A's explicit Save changes the library. Inspect provider settings for handling private strategy material.
- [ ] Refresh or reopen the draft on another device before and after upload. A pending draft should explain that the original prompt remains only in its original tab; an uploaded draft should reopen for review. Revoke a grant and verify subsequent upload refuses it.
- [ ] Try invalid JSON, unknown/executable fields, a ZIP/Python file and a file over 64 KB. Correct and retry; no saved agent should change after validation failure.
- [ ] Interrupt the network during upload and save. Retry the same request or refresh status. One agent/version should result, even after a successful response is lost.
- [ ] Open Update for the same agent in two A tabs. Save different packages concurrently. One succeeds and one reports a stale version. Start a fresh update from the latest saved version. Confirm existing competition entries and historical receipts are untouched.
- [ ] In staging, upload using the old vault key, retain it while switching currentKeyId to a new independent key, then save the draft. Reopen with a fresh service. Separately test missing retained key refusal and session-signing rotation. Do not discard keys required by backups.
- [ ] Reach five active drafts and twenty daily creations. Confirm the cap survives an API restart and concurrent tabs. Verify expired drafts refuse upload/save. Check encrypted retention and backup cleanup policy.
- [ ] Choose a compatible competition after save. The correct saved agent should load without another upload/save form. Final X verification, wallet approval, entry eligibility and replacement rules must still apply.
- [ ] Test file selection, keyboard operation, clipboard denial/manual copy, expiry, retry messages and touch controls on real desktop and mobile browsers.
- [ ] Run the full earlier promise-repair production checklist for worker recovery, fair queues, scoring/reward consistency, replay privacy and reconnection. Any funded/mainnet action needs separate explicit authorization.

## User-run Git commands

Review first. These commands are supplied for the user; the agent has not run them. They deliberately exclude the unrelated .gitignore and ui-artifacts changes.

```powershell
 git add -- README.md docs/AGENT-ONBOARDING-RESEARCH-2026-09-04.md docs/AGENT-ONBOARDING-VERIFICATION-2026-09-04.md docs/OPERATIONS.md docs/PRIVACY.md public/AGENT.md
 git add -- drizzle/0023_participant_agent_drafts.sql drizzle/meta/_journal.json src/app/api/agent-drafts src/app/api/profile/agent-drafts src/app/profile/agents src/app/play/page.tsx src/app/profile.css
 git add -- src/components/agent-onboarding.tsx src/components/veil-profile.tsx src/components/veil-arena-play.tsx src/lib/api/agent-onboarding.ts
 git add -- src/server/arena/participant-agent-draft-record.ts src/server/arena/participant-agent-draft-routes.test.ts src/server/arena/participant-agent-draft-runtime.ts src/server/arena/participant-agent-drafts.test.ts src/server/arena/participant-agent-drafts.ts src/server/arena/participant-agent-service.ts src/server/arena/arena-readiness-database.ts
 git add -- src/server/db/repositories.ts src/server/db/schema.ts src/server/http/agent-draft-response.ts src/server/http/api-cors.ts src/server/http/api-cors.test.ts src/server/http/service-response.ts tests/e2e/agent-onboarding.spec.ts
 git diff --cached --check
 git diff --cached --stat
 git commit -m "feat(agents): add private upload review and save workflow"
```

Inspect the staged diff before committing. No push command is included: pushing main triggers the existing deployment workflow and should follow the migration/configuration review above.

## Cleanup

Verified container c3d2507e69b123cf90e95785dcfc9b953df31b60b2c81aac6f463dcea89f2d03, label veil.disposable=agent-onboarding-20260904, and local port 55450 before removing only veil-agent-onboarding-audit-20260904 and its disposable volume. The database had 24 migration journal rows and zero saved/revoked drafts retaining ciphertext. It contained test-only data. Existing production and unrelated local databases were not touched.

## Final result

The final production build passes all 247 tests in 55 files with no skips. All 72 desktop/mobile Playwright journeys pass, including fourteen new onboarding journeys and all eighteen promise-audit browser tests. The champion benchmark completes all 256 matches without failure. Git diff --check reports no whitespace errors; normal Windows line-ending warnings remain. Original audit/repair evidence, engine, benchmark inputs/results and unrelated .gitignore/ui-artifacts work were preserved. No staging, commit, push, deployment, production migration, production secret rotation, wallet signature or transaction was performed. Production acceptance remains the unchecked owner checklist above.
