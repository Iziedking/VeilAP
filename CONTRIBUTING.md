# Contributing to Veil Arena

Veil Arena handles encrypted strategy data, wallet authentication, deterministic competition evidence, and private reward authorization. Changes must preserve those boundaries before improving convenience.

## Development setup

1. Use Node.js 22 and npm.
2. Install the exact lockfile with `npm ci`.
3. Copy `.env.example` to `.env.local` and choose persisted development or empty interface review as described in the README.
4. Run the application on port 3011. Port 3010 is reserved for Playwright.

Never commit environment files, wallet material, AWS credentials, RPC credentials, receipt private keys, private strategy data, payout wallets, or transfer authorizations.

## Engineering rules

- Keep TypeScript strict and parse every external request with a bounded schema.
- Keep public and private response models separate.
- Preserve idempotency and expected-state checks on every write or wallet workflow.
- Treat PostgreSQL as the authority in persisted mode. Do not add process-local competition state.
- Encrypt strategies, payout wallets, seeds, and reward authorizations before persistence.
- Never ask for or store a wallet private key or viewing key.
- Do not add fabricated seasons, agents, scores, receipts, rewards, or chain state to shipped product code.
- Test doubles and deterministic fixtures belong only in test code.
- Do not claim operator blindness, zero-knowledge execution, contract escrow, or public proof of hidden STRK20 fields.

## Database changes

Add a new numbered SQL migration and append the matching Drizzle journal entry. Never rewrite an applied migration. Prove the migration against a disposable PostgreSQL 16 database, then apply the full chain a second time to verify idempotency.

Repository integration tests that require PostgreSQL use `TEST_DATABASE_URL`. They must create uniquely named records and remove only those records in a `finally` block.

## Interface changes

Player-facing copy must explain what to do, what remains private, and what can be won. Keep primary controls at least 44 pixels high, preserve keyboard focus, prevent horizontal overflow at 390 pixels, support reduced motion, and avoid em dashes in interface copy.

Empty states must state that no persisted record exists. They must never display invented tournament activity.

## Required verification

Run every command before requesting review:

```bash
npm run check
npm run prove
npm run test:e2e
npm run build
```

For changes to enrollment, migrations, or database transactions, also run the PostgreSQL integration suite with a disposable database:

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/DATABASE \
  npx vitest run src/server/db/repositories.postgres.test.ts
```

For deployment changes, validate `docker-compose.prod.yml` with the placeholder deployment environment and run `bash -n` on every shell script.

## Pull request checklist

- Explain the user problem and the trust boundary affected.
- List migrations, environment variables, wallet actions, and operational changes.
- Include test evidence and desktop plus mobile screenshots for interface work.
- Confirm that public responses omit strategy and reward-private fields.
- Confirm that no secret or private user record entered the diff.
- Keep the change focused and document any limitation that remains.
