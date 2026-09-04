# Veil Arena deployment

Veil Arena uses Vercel for the browser application and one AWS EC2 VM for the API, PostgreSQL, the match worker, and Caddy.

Production addresses:

- browser: `https://veilap.xyz`
- API: `https://api.veilap.xyz`

Do not configure the Vercel browser to call a plain HTTP VM address. Browsers will block mixed content and secure cookies will not behave correctly.

## Topology

```text
Player browser
  | HTTPS
  +--> veilap.xyz                Vercel browser deployment
  |
  +--> api.veilap.xyz            Caddy on EC2
          |
          +--> Next.js API       private Docker network
          +--> PostgreSQL 16     private Docker network and EBS volume
          +--> match worker      private Docker network
          +--> AWS KMS           EC2 instance role
          +--> Starknet RPC      outbound HTTPS
```

Only ports 80 and 443 should be public after TLS is live. Restrict SSH port 22 to trusted administrator addresses. PostgreSQL must not be exposed by the EC2 security group or Docker port mapping.

## Required AWS controls

Attach the `veil-arena-ec2` role to the EC2 instance. Grant that role only these actions on the Veil Arena customer-managed KMS key:

```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:DescribeKey"
  ],
  "Resource": "arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
}
```

Keep the standard account-root administration statement in the KMS key policy. Do not put AWS access-key credentials in the repository, Vercel, GitHub Actions, or the VM environment file. The AWS SDK uses the EC2 role through instance metadata.

Enable encrypted EBS storage and keep the KMS key in the same region as the VM. KMS request cost is usage-based, but repeated strategy execution increases decrypt calls, so monitor CloudWatch and KMS usage during larger seasons.

## One-time VM preparation

SSH to the server:

```bash
ssh veil-vm
```

Install Docker Engine and the Docker Compose plugin from the current Ubuntu Docker instructions. Then create the application directories:

```bash
sudo mkdir -p /opt/veil-arena/config /opt/veil-arena/releases
sudo chown -R ubuntu:ubuntu /opt/veil-arena
```

For a small VM, a 2 GiB swap file can prevent a Docker build from being killed. Use it only as a build safety margin, not as a replacement for sufficient memory:

```bash
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
```

Create `/opt/veil-arena/config/veil-arena.env` from `deploy/veil-arena.env.example`, replace every placeholder, and restrict the file:

```bash
chmod 600 /opt/veil-arena/config/veil-arena.env
```

## Server environment

| Variable | Purpose |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Private PostgreSQL service |
| `DATABASE_POOL_MAX` | App connection limit; keep low on a small VM |
| `STARKNET_RPC_URL` | Server-only Mainnet RPC |
| `VEILAP_APP_ORIGIN` | Exact browser origin, `https://veilap.xyz` |
| `VEILAP_SESSION_SECRET` | At least 64 random characters |
| `VEILAP_PARTICIPANT_VAULT_KEYS` | Server-only versioned saved-package key ring; independent 32-byte hex keys, retained legacy readers; see OPERATIONS.md |
| `VEILAP_WALLET_HASH_PEPPER` | At least 64 independent random characters |
| `VEILAP_KMS_KEY_ID` | Full customer-managed KMS key ARN |
| `AWS_REGION` | KMS and EC2 region |
| `VEILAP_RECEIPT_SIGNING_PRIVATE_KEY` | Server-only Ed25519 receipt key |
| `VEILAP_RECEIPT_SIGNING_PUBLIC_KEY` | Published receipt verification key |
| `VEILAP_ARENA_WORKER_SECRET` | Long internal worker secret |
| `VEILAP_ARENA_WORKER_WALLET_ADDRESS` | Existing project company or reviewer wallet |
| `X_OAUTH_CLIENT_ID` | X OAuth 2.0 confidential Web App client ID |
| `X_OAUTH_CLIENT_SECRET` | Server-only X OAuth client secret |
| `X_OAUTH_REDIRECT_URI` | Exact callback, `https://api.veilap.xyz/api/auth/x/callback` |
| `NEXT_PUBLIC_STARKNET_CHAIN_ID` | Must be `SN_MAIN` for the sprint |
| `NEXT_PUBLIC_STRK20_POOL_ADDRESS` | Pinned official STRK20 pool |
| `VEIL_API_DOMAIN` | `api.veilap.xyz` after DNS is ready |

Generate the session secret, wallet pepper, worker secret, and receipt keys independently. Never reuse one value for another purpose.

## X participant verification

Create a Web App in the X Developer Console and enable OAuth 2.0. Configure the exact callback URL `https://api.veilap.xyz/api/auth/x/callback`. The website URL should be the exact public browser origin used by `VEILAP_APP_ORIGIN`.

The application requests `tweet.read users.read`, the read-only scopes X currently requires for authenticated user lookup. Do not add write, follow, direct-message, email, or `offline.access` scopes. Store the client secret only in `/opt/veil-arena/config/veil-arena.env`, keep that file mode `600`, and restart through the normal release workflow after updating it.

X currently charges $0.01 for a user read. Veil Arena performs one `/2/users/me` read when an account is connected and does not poll X afterward. Set a small spending limit in the X Developer Console before production testing.

Official references:

- [OAuth 2.0 Authorization Code with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
- [Authenticated user lookup](https://docs.x.com/x-api/users/get-my-user)
- [Current X API pricing](https://docs.x.com/x-api/getting-started/pricing)

## Vercel configuration

Connect `Iziedking/VeilAP` and deploy `main`. Configure:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_VEIL_API_ORIGIN` | `https://api.veilap.xyz` |
| `NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID` | The real persisted public arena project ID |
| `NEXT_PUBLIC_STARKNET_CHAIN_ID` | `SN_MAIN` |
| `NEXT_PUBLIC_STRK20_POOL_ADDRESS` | Official pinned pool address |

Do not add database credentials, KMS identifiers, AWS credentials, session secrets, peppers, worker secrets, private receipt keys, or RPC credentials to Vercel.

## GitHub Actions configuration

Add these repository secrets:

| Secret | Value |
| --- | --- |
| `VEIL_VM_HOST` | VM DNS name or stable Elastic IP |
| `VEIL_VM_USER` | `ubuntu` |
| `VEIL_VM_SSH_KEY` | Complete private key for deployment |
| `VEIL_VM_KNOWN_HOSTS` | Reviewed `ssh-keyscan -H <host>` output |

The workflow performs these gates before deployment:

1. exact dependency installation with `npm ci`;
2. type checking, lint, and Vitest;
3. two consecutive migration runs against disposable PostgreSQL 16;
4. production build;
5. desktop and mobile Playwright journeys.

The deploy job builds a release-specific Docker image, starts the database, applies migrations, changes the `current` symlink only after the migration succeeds, starts the app and Caddy with health waits, and restores the previous release if the new app fails after activation.

## DNS and TLS

Create an `A` record for `api.veilap.xyz` that points to a stable Elastic IP attached to the EC2 instance. Set `VEIL_API_DOMAIN=api.veilap.xyz`. Caddy obtains and renews the certificate automatically after public DNS resolves and ports 80 and 443 reach the VM.

Before DNS is ready, `VEIL_API_DOMAIN=:80` can support a VM-only HTTP smoke test. Do not connect the HTTPS Vercel frontend to that temporary endpoint.

## Arena worker

The production Compose stack includes one dedicated worker container. It polls the protected worker endpoint over the private Docker network, claims one scheduled or retryable match using a database lease, and immediately polls again after completion. This means a locked competition begins within the polling interval and continues through its schedule without an operator clicking every match.

The worker is deliberately single-flight: it never runs two matches in the same process, database claims prevent duplicate execution, and stable idempotency keys make retries safe. It backs off when the API is unavailable or misconfigured, logs only state and match identifiers, and exits cleanly on deployment shutdown. It never signs or broadcasts a reward transaction.

Optional tuning values belong in `/opt/veil-arena/config/veil-arena.env`. Keep the worker secret in that protected file and never add it to Vercel:

```dotenv
VEILAP_ARENA_WORKER_POLL_MS=1000
VEILAP_ARENA_WORKER_IDLE_POLL_MS=2500
VEILAP_ARENA_WORKER_ERROR_BACKOFF_MS=5000
```

The deployment script starts `worker` only after the app health check passes. Inspect it with:

```bash
sudo docker compose \
  --project-directory /opt/veil-arena/current \
  --env-file /opt/veil-arena/config/veil-arena.env \
  -f /opt/veil-arena/current/docker-compose.prod.yml \
  ps worker
sudo docker compose \
  --project-directory /opt/veil-arena/current \
  --env-file /opt/veil-arena/config/veil-arena.env \
  -f /opt/veil-arena/current/docker-compose.prod.yml \
  logs --tail=100 worker
```

## First deployment

The user initiates deployment by pushing the reviewed commit:

```bash
git push origin main
```

Watch the `Verify and deploy Veil Arena` workflow. After it succeeds, verify:

```bash
curl --fail-with-body --silent --show-error https://api.veilap.xyz/api/health
curl --fail-with-body --silent --show-error https://api.veilap.xyz/api/internal/arena/readiness \
  -H "x-veil-arena-worker-secret: $VEILAP_ARENA_WORKER_SECRET"
```

The health endpoint must report persisted mode, a reachable database, and `xVerification: "configured"`. Readiness must report every check as true before creating a live season.

## Recovery

Releases live under `/opt/veil-arena/releases/<commit-sha>`. The active release is `/opt/veil-arena/current`.

To redeploy a reviewed previous release:

```bash
sudo docker compose \
  --project-directory /opt/veil-arena/current \
  --env-file /opt/veil-arena/config/veil-arena.env \
  -f /opt/veil-arena/current/docker-compose.prod.yml \
  stop worker
VEIL_ARENA_RELEASE_DIR=/opt/veil-arena/releases/PREVIOUS_COMMIT_SHA \
  bash /opt/veil-arena/releases/PREVIOUS_COMMIT_SHA/scripts/deploy-vm.sh
```

Only roll application code back across migrations that are backward compatible. Take and verify a database backup before schema changes that cannot support the previous release.
