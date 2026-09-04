# Veil Arena operations runbook

## Operating principle

Do not advance a live season while health, readiness, database backup, wallet plan, or chain state is uncertain. An honest pause is safer than an invented success.

## Before every live demo or season

1. Confirm the GitHub deployment and Vercel deployment both succeeded for the same reviewed commit.
2. Confirm `https://api.veilap.xyz/api/health` reports persisted mode and a reachable database.
3. Confirm the protected readiness endpoint reports every check as true.
4. Confirm the worker container is running and has no recent failures.
5. Confirm the default player-entry project in Vercel matches the intended database project. The global lobby discovers all persisted competitions independently.
6. Confirm the season template, rules commitment, exact workload, entry capacity, replacement policy, reward mode, and, when funded rewards are advertised, the token, amount, sponsor wallet, and STRK20 pool.
7. Take a PostgreSQL backup before a production migration or high-value season.
8. Keep the operator wallet on Starknet Mainnet and verify every wallet plan before approval.

## Service inspection

```bash
ssh veil-vm
cd /opt/veil-arena/current
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml ps
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml logs --tail=150 app
sudo docker compose --project-directory /opt/veil-arena/current --env-file /opt/veil-arena/config/veil-arena.env -f /opt/veil-arena/current/docker-compose.prod.yml ps worker
sudo docker compose --project-directory /opt/veil-arena/current --env-file /opt/veil-arena/config/veil-arena.env -f /opt/veil-arena/current/docker-compose.prod.yml logs --tail=100 worker
```

Logs must not include strategy policies, payout addresses, transfer authorizations, session cookies, viewing keys, private keys, or complete request bodies.

## Health and readiness

Public liveness:

```bash
curl --fail-with-body --silent --show-error https://api.veilap.xyz/api/health
```

Protected arena readiness from the VM:

```bash
curl --fail-with-body --silent --show-error http://127.0.0.1/api/internal/arena/readiness \
  -H "x-veil-arena-worker-secret: $VEILAP_ARENA_WORKER_SECRET"
```

Do not run a season if readiness reports a blocker for persisted mode, database, arena schema, KMS, receipt signing, STRK20 pool, worker configuration, or X verification.

The readiness gate performs live checks. It verifies database connectivity, all arena and participant-identity tables and critical columns, an enabled encrypt-and-decrypt KMS key that the EC2 role can describe, a matching Ed25519 receipt key pair, a valid STRK20 pool address, a strong worker secret with a valid worker wallet, and the exact production X OAuth callback configuration. It does not call X, send a Starknet transaction, or execute a paid KMS encrypt/decrypt probe.

## PostgreSQL backup

Create a timestamped compressed backup outside the container:

```bash
cd /opt/veil-arena/current
mkdir -p /opt/veil-arena/backups
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "/opt/veil-arena/backups/veil-arena-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Copy backups to encrypted storage outside the VM and test restoration into a disposable database. A backup that has never been restored is not verified.

## Season operation

1. Create the competition from the operator console. The quick-start formats are Friend challenge, Public freepass, and Sponsored open. Advanced formats are Open league, Duel series, Benchmark gauntlet, Championship, and Custom. On the first publish, the API creates the encrypted project workspace automatically.
2. Review the resolved pairing mode, workload, replacement policy, privacy policy, and rules commitment before creation. Custom formats may use only audited scheduler primitives.
3. Publish it as an exhibition, pledged reward, or funded reward competition. Exhibition and pledged seasons do not require seeded liquidity. Championship must be funded before roster lock.
4. Verify that coding agents can discover it through `/api/agent-submissions` and that real wallet-approved entries appear.
5. For formats that allow improvement, monitor only version identity, commitment, status, and daily accepted-count metadata. Never log or inspect submitted policy bodies. Replacement closes at roster lock.
6. If a guaranteed reward is advertised, create the sponsor reward record before matches begin.
7. Review the exact shield plan, approve it in the sponsor wallet, sign the matching Veil Arena authorization, and wait for confirmed funding state.
8. For a benchmark gauntlet, select an enrolled benchmark agent before lock.
9. Lock only after the intended roster is complete. Locking makes the active versions and rules snapshot authoritative.
10. Confirm the worker is running. It discovers locked seasons globally and starts queued matches automatically.
11. Monitor scheduled, running, completed, retryable, and terminal match counts.
12. Open the public competition room and verify that completed matches expose a hand-receipt replay without cards, policies, reasoning, or a raw seed.
13. Prepare settlement only after every pairing is complete and a unique winner exists.
14. Review the exact private transfer plan, approve it in the sponsor wallet, sign the authorization, and wait for settled state.
15. Verify that the public settlement receipt omits private fields.

Entry is never blocked only because a reward record is missing or pending. The public interface must label these states honestly as exhibition or pledged. Do not describe a reward as guaranteed until funding is confirmed.

### Private friend challenge

1. Choose Friend challenge and publish it.
2. Open the season and copy the expiring private join link.
3. Send that link directly to the other player. Do not post it in the public lobby.
4. Each link holder signs in with their own Starknet wallet and approves one sealed package.
5. Lock the roster after both entries appear, then let the worker run all three scheduled matches.

### Public freepass

1. Choose Public freepass and publish it without creating a reward record.
2. Confirm it appears in `/arena` as Free entry and No prize.
3. Accept at least two real wallet-approved packages.
4. Lock the roster and let the worker execute the complete round robin.

### Null Jack

The `/champion` route is self-service. A signed-in player starts a challenge against Null Jack, receives a private entry path, submits one real package, and fills the remaining seat. The roster locks automatically. Operations still need the normal worker timer to claim and execute its scheduled matches.

## Chain uncertainty

If a funding or settlement confirmation returns uncertain:

- do not broadcast another transaction immediately;
- keep the transaction hash and wallet record;
- wait for the RPC to reach a stable final state;
- retry confirmation with the same transaction and matching authorization while it remains valid;
- if the authorization expires, retrieve the unchanged plan and sign a new authorization for the same transaction;
- never paste a hash from a different operation.

The application accepts terminal idempotent confirmation only for the same recorded hash.

## Incident responses

### Database unavailable

Stop the worker container, inspect disk and container health, and restore service before accepting entries or wallet actions. Do not switch to in-memory preview mode in production.

### KMS denied or unavailable

Stop match execution and entry writes. Verify the EC2 role attachment, key region, exact key ARN, and key policy. Do not add long-lived AWS access keys as a shortcut.

### Receipt signing failure

Stop new match execution. Existing signed receipts remain readable. Repair the configured key pair and prove that the public key matches the private signer before resuming.

### Worker repeats or stalls

Stop the worker container, inspect lease expiry and terminal records, and run one protected tick manually. Do not edit match rows directly unless a reviewed recovery procedure accounts for idempotency and receipt state.

### Suspected strategy disclosure

Stop execution, preserve logs without copying plaintext, revoke affected access, rotate project encryption material through a reviewed migration, notify affected builders, and document exactly which boundary failed.

### Sponsor wallet compromise

Stop reward actions immediately. Do not change the sponsor wallet inside an active reward record without a reviewed migration and participant disclosure. The service correctly rejects a different sponsor wallet.

## Release rollback

Stop the worker before rollback. Use a known release directory and the deployment script described in [DEPLOYMENT.md](DEPLOYMENT.md). Verify health, readiness, and one read-only public route before restarting the worker.

Application rollback is safe only while the database migration remains backward compatible.

## Promise-repair rollout and recovery

The 2026-09-04 repair adds migrations 0021 (selective-disclosure nonce) and 0022 (durable scheduled seed and retry time). Existing receipts, results and agent artifacts must remain unchanged. Apply these only through the owner's reviewed rollout after backup and staging restoration; the repair session applies them only to a disposable local database. Readiness now checks the saved-package table, these columns and participant vault configuration.

Configure VEILAP_PARTICIPANT_VAULT_KEYS as server-only JSON with currentKeyId, a keys map of ID to independently generated 32-byte hex key, and optional legacySessionSecrets. Keep it in the protected deployment secret store; never put real values in source, logs or client configuration. Docker Compose passes this variable to the app. Existing session signing and wallet fingerprint secrets are separate concerns.

For staging rotation: back up database and retained keys together; add the new key without removing old keys; switch currentKeyId; verify a fresh service can open old and new packages; have an authenticated owner POST /api/profile/agents/:agentId/rewrap for each saved package; verify IDs, versions and commitments are unchanged. Retain the old data keys and legacy session secrets until all relevant packages and retained backups have a verified recovery path. Rewrap is owner-scoped and atomic, not an automatic destructive bulk migration. No production secret rotation was performed.

A match becomes eligible ten seconds after creation for sequence one, then at ten-second sequence intervals. This is not a worker reservation. The UI distinguishes eligibility, waiting for capacity, execution, recovery, retry and final failure. Leases last 120 seconds; a job receives at most three claims with 5- and 10-second retry delays after ordinary failures. Running jobs with expired leases can be reclaimed; stale attempts cannot publish receipts or overwrite a newer attempt. A receipt saved before a crash is reconciled even if the final attempt has been used. Durable seeds prevent retries from changing the game.

Worker HTTP calls have a 90-second default deadline below the lease. KMS describe, wrap and unwrap requests also receive a ten-second cancellation signal. Request abortion does not cancel synchronous server computation; publication fencing prevents an expired computation from becoming authoritative. The health file proves recent valid tick responses and marks failures unhealthy after the configured threshold; it does not prove useful match throughput. Monitor oldest eligible job age, attempt counts, exhausted failures and completion progress as well as container health. A persistently oversized computation can exhaust its retries and needs operator investigation, not deletion of historical results.

Champion creation retries use the same client idempotency key, including after refresh. A failed automatic roster lock returns an error identifying that enrollment was saved; retry or operator lock must reconcile that entry instead of creating a replacement competition.

Use the [multi-account testing checklist](PROMISE-REPAIRS-2026-09-04.md#multi-account-production-acceptance-checklist) before broad participant testing. Worker-kill, poison-job, key-rotation and restore exercises belong in staging first.

## Agent library drafts, 2026-09-04

Apply additive migration 0023_participant_agent_drafts.sql through the normal migration journal after staging review. It creates one table and owner/creation index; it does not rewrite saved agents or competition records. Arena readiness checks the draft table and critical columns. Rollback of application code can leave this additive table in place.

The existing VEILAP_PARTICIPANT_VAULT_KEYS independent ring protects drafts as well as saved agents. Add no new session-secret fallback. Retain prior keys during rotation; an uploaded draft is decrypted with its recorded key ID and saved with the current key. Missing old keys return DRAFT_KEY_UNAVAILABLE without saving or consuming. No production keys were generated or rotated in this change.

No new paid provider calls or worker are added. POST /api/profile/agent-drafts requires a wallet session and enforces five active drafts and twenty creations per rolling day atomically in PostgreSQL. It deletes this owner's records older than 24 hours before creating a new grant. Revocation and save clear draft ciphertext. Expired dormant records stay inaccessible but may remain physically stored until this cleanup. Review and save retries are available while the record is retained; the saved library agent survives draft cleanup.

POST /api/agent-drafts/upload accepts the raw package JSON, up to 64 KB, with a bearer grant. Do not record Authorization headers or bodies in edge logs, tracing, or support tickets. Browser CORS remains restricted to the configured frontend; CLI callers need no Origin header. Use the existing proxy request/rate limits for abusive traffic. Grant creation caps are per wallet and do not constitute a global anti-Sybil or volumetric DDoS guarantee.

Operator recovery: a missing or invalid current ring blocks upload/save; restore the ring then retry the same draft. A missing retained key blocks finalization while leaving the draft ready. A lost save response is reconciled by GET /api/profile/agent-drafts/:id or an identical save retry. No database editing is needed. A stale version conflict requires a fresh explicit Update from My agents. Never change a historical receipt or tournament entry to resolve a library conflict.

## Duplicate strategy rule rollout, 4 September 2026

Review additive migration 0024 after 0023. It adds nullable strategy_fingerprint, a unique season/fingerprint index, and a trigger requiring a valid digest for reject_exact rules. Existing rows remain null; old snapshots, entries, receipts and results are not backfilled. The normal index build can briefly block writes; review table size and use a maintenance window. Apply the migration before enabling the new app build. Schema readiness now checks the new column, unique index and enabled required-value trigger.

New template version 2 always commits reject_exact. Version 1 parses without adding a field. The restriction applies to the current roster only: an owner can retain their own policy on replacement, and a retired policy becomes available. Direct/operator/system and public/invite entry share enforcement. Unique conflicts return ARENA_DUPLICATE_STRATEGY without identifying the other entry.

No additional production secret is required. Existing project data keys derive the private index key. Wrapping-key rotation that preserves project data-key bytes preserves equality. Independent participant vault and session key rotations do not affect the index. Do not replace project data-key bytes on an active competition: first pause admission and design a coordinated decrypt/re-encrypt/index rebuild with collision checks. This work does not implement or authorize that production operation.

Rollback: pause new competition creation and admission before reverting application versions. Keep the additive column, index and trigger and preserve all version 2 snapshots. Old binaries cannot interpret version 2 safely; fail closed instead of removing the rule or rewriting its commitment. Continue with a compatible repair build. See DUPLICATE-STRATEGY-VERIFICATION-2026-09-04.md for the release evidence and multi-account checklist.
