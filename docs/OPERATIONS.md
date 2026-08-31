# Veil Arena operations runbook

## Operating principle

Do not advance a live season while health, readiness, database backup, wallet plan, or chain state is uncertain. An honest pause is safer than an invented success.

## Before every live demo or season

1. Confirm the GitHub deployment and Vercel deployment both succeeded for the same reviewed commit.
2. Confirm `https://api.veilap.xyz/api/health` reports persisted mode and a reachable database.
3. Confirm the protected readiness endpoint reports every check as true.
4. Confirm the worker timer is active and has no recent failures.
5. Confirm the public project ID in Vercel matches the intended database project.
6. Confirm the season times, entry capacity, hand count, reward mode, and, when funded rewards are advertised, the token, amount, sponsor wallet, and STRK20 pool.
7. Take a PostgreSQL backup before a production migration or high-value season.
8. Keep the operator wallet on Starknet Mainnet and verify every wallet plan before approval.

## Service inspection

```bash
ssh veil-vm
cd /opt/veil-arena/current
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml ps
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml logs --tail=150 app
sudo systemctl status veil-arena-worker.timer
sudo journalctl -u veil-arena-worker.service -n 100 --no-pager
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

Do not run a season if readiness reports a blocker for persisted mode, database, arena schema, KMS, receipt signing, STRK20 pool, or worker configuration.

The readiness gate performs live checks. It verifies database connectivity, all arena tables and critical enrollment and reward columns, an enabled encrypt-and-decrypt KMS key that the EC2 role can describe, a matching Ed25519 receipt key pair, a valid STRK20 pool address, and a strong worker secret with a valid worker wallet. It does not send a Starknet transaction or execute a paid KMS encrypt/decrypt probe.

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

1. Create the season from the operator console and choose open entry.
2. Publish it as an exhibition, pledged reward, or funded reward competition.
3. Verify that coding agents can discover it through `/api/agent-submissions` and that real wallet-approved entries appear.
4. If a guaranteed reward is advertised, create the sponsor reward record before matches begin.
5. Review the exact shield plan, approve it in the sponsor wallet, sign the matching Veil Arena authorization, and wait for confirmed funding state.
6. Lock only after the intended roster is complete.
7. Enable the worker timer for the active project and season.
8. Monitor scheduled, running, completed, retryable, and terminal match counts.
9. Prepare settlement only after every pairing is complete and a unique winner exists.
10. Review the exact private transfer plan, approve it in the sponsor wallet, sign the authorization, and wait for settled state.
11. Verify that the public settlement receipt omits private fields.

Entry is never blocked only because a reward record is missing or pending. The public interface must label these states honestly as exhibition or pledged. Do not describe a reward as guaranteed until funding is confirmed.

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

Stop the worker timer, inspect disk and container health, and restore service before accepting entries or wallet actions. Do not switch to in-memory preview mode in production.

### KMS denied or unavailable

Stop match execution and entry writes. Verify the EC2 role attachment, key region, exact key ARN, and key policy. Do not add long-lived AWS access keys as a shortcut.

### Receipt signing failure

Stop new match execution. Existing signed receipts remain readable. Repair the configured key pair and prove that the public key matches the private signer before resuming.

### Worker repeats or stalls

Disable the timer, inspect lease expiry and terminal records, and run one protected tick manually. Do not edit match rows directly unless a reviewed recovery procedure accounts for idempotency and receipt state.

### Suspected strategy disclosure

Stop execution, preserve logs without copying plaintext, revoke affected access, rotate project encryption material through a reviewed migration, notify affected builders, and document exactly which boundary failed.

### Sponsor wallet compromise

Stop reward actions immediately. Do not change the sponsor wallet inside an active reward record without a reviewed migration and participant disclosure. The service correctly rejects a different sponsor wallet.

## Release rollback

Pause the worker before rollback. Use a known release directory and the deployment script described in [DEPLOYMENT.md](DEPLOYMENT.md). Verify health, readiness, and one read-only public route before restarting the worker.

Application rollback is safe only while the database migration remains backward compatible.
