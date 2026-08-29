# Veil Arena deployment

This repository uses one AWS EC2 VM for the application and PostgreSQL, with Vercel connected separately for the frontend deployment.

## What deploys on a push

Every push to `main` runs the checks and production build in GitHub Actions. When those pass, the workflow packages the repository, copies the release to the VM over SSH, runs the Drizzle migration, rebuilds the Docker image, and restarts the application behind Caddy.

The database is only reachable on the Docker private network. Caddy is the only public application entry point.

## One-time VM setup

SSH to the server:

```bash
ssh veil-vm
```

Create the deployment directories and a small swap file for the Docker build:

```bash
sudo mkdir -p /opt/veil-arena/config /opt/veil-arena/releases
sudo chown -R ubuntu:ubuntu /opt/veil-arena
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
```

Create `/opt/veil-arena/config/veil-arena.env` from `deploy/veil-arena.env.example`. Use long random values for the database password, session secret, wallet hash pepper, and receipt signing keys. Keep this file on the VM only:

```bash
chmod 600 /opt/veil-arena/config/veil-arena.env
```

Set `VEILAP_APP_ORIGIN` to the final Vercel origin. Set `VEIL_API_DOMAIN` to the API hostname after its DNS record points to the VM. Use `:80` only for an initial HTTP smoke test. A Vercel HTTPS frontend needs an HTTPS API hostname to avoid browser mixed-content blocking.

Install Docker Engine and the Docker Compose plugin on the VM before the first push. The Ubuntu Docker installation guide is the source of truth for those packages.

## GitHub Actions secrets

Add these repository secrets under Settings, Secrets and variables, Actions:

| Secret | Value |
| --- | --- |
| `VEIL_VM_HOST` | The VM public DNS name or Elastic IP |
| `VEIL_VM_USER` | `ubuntu` |
| `VEIL_VM_SSH_KEY` | The complete private key used by Actions |
| `VEIL_VM_KNOWN_HOSTS` | Reviewed output from `ssh-keyscan -H <vm-host>` |

Do not add `DATABASE_URL`, KMS credentials, session secrets, signing keys, or the Alchemy key to GitHub Actions. They belong in the VM environment file or the VM role configuration.

## Vercel

Connect the `Iziedking/VeilAP` repository in Vercel and enable deployment from `main`. Vercel will build the repository on every push. Keep backend-only values out of Vercel, including `DATABASE_URL`, `VEILAP_SESSION_SECRET`, `VEILAP_WALLET_HASH_PEPPER`, KMS identifiers, and receipt signing keys.

The current GitHub workflow deploys the complete Next application to the VM. Before treating Vercel as a browser-only frontend, the client API base URL and cross-origin policy must be configured for the API hostname.

## First deployment

After the VM environment, Docker, security group, DNS, and GitHub secrets are ready, run the user-owned Git command:

```bash
git push origin main
```

Watch the `Verify and deploy Veil Arena` workflow in GitHub Actions. If deployment fails, inspect the workflow log and then connect with `ssh veil-vm` to run:

```bash
cd /opt/veil-arena/current
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml ps
docker compose --env-file /opt/veil-arena/config/veil-arena.env -f docker-compose.prod.yml logs --tail=100 app
```

The application health endpoint is `/api/health`. It must report a reachable database before Caddy starts serving the release.

## Recovery

Releases are stored under `/opt/veil-arena/releases`. The active release is the `/opt/veil-arena/current` symlink. To return to a previous release, point the symlink at the required release directory and run `scripts/deploy-vm.sh` from that release.
