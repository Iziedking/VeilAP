# Exact strategy competition rule

Approved 2026-09-04 after the agent onboarding milestone. Follow izie-build-standard.

New competitions use template version 2 with an explicit reject_exact duplicateStrategyPolicy. Version 1 snapshots remain byte-equivalent on parsing; absent policy means legacy admission. No backfill, old result rewrite, or private library restriction. The active roster permits one normalized policy per competition. An owner may replace their own entry with the same policy; a retired policy becomes available again.

Use existing canonical serialization and Node crypto HMAC-SHA256, deriving a domain-separated season key from the project's random data key. Compare engine, policy format, rules and fallback only. Ignore package agentId and displayName. Object ordering is normalized; rule order remains meaningful. This is exact structural matching, not semantic equivalence or identity verification. No fuzzy auto-ban.

A nullable private strategyFingerprint column and unique season/fingerprint index protect concurrent admission. All service paths compute it, including operator registration and system entries. Repository writes require it for version 2 and check under the season lock; a database trigger also refuses missing fingerprints under that rule. Failure rolls back artifact/history/audit writes. Public views, errors and audit metadata never expose fingerprints or the matching account.

No new production secret. Project wrapping-key changes that preserve the data key preserve comparisons. Vault and session key rotation are independent. Replacing the project data key itself requires a separate coordinated re-encryption and fingerprint rebuild while entry is paused; do not silently change it. No production rotation is authorized.

Privacy: trusted backend operators can decrypt policies. The private index reveals within-season equality to database readers. A rejected authorized entry reveals that an equivalent normalized policy is already active; do not claim zero membership leakage. No public fingerprint or global lookup. Wallet and X binding do not prove one person per account. Substantive or semantically equivalent policy edits can evade exact matching.

Verification: first reproduce renamed-copy acceptance before application edits. Cover concurrency, replacement rollback, cross-season independence, legacy commitments, all admission paths, private libraries and response privacy. Apply additive migration twice only to a labelled disposable local PostgreSQL database. Run full build, browser suites, promise probes, worker/proof checks and unchanged champion benchmark. User owns Git and production testing.
