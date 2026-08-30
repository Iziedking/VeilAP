# Dependency ground truth

Verified against the installed dependency tree and lockfile on 2026-08-30. Recheck primary sources before changing wallet or privacy code.

| Concern | Exact pin | Evidence and reason |
| --- | --- | --- |
| Starknet SDK | `starknet@10.4.0` | STRK20 Wallet API support starts at 10.4.0. The official starter kit pins this version. |
| Wallet discovery | `@starknet-io/get-starknet-discovery@6.0.2` | Exact version read from the official starter kit package manifest. |
| Wallet standard | `@starknet-io/get-starknet-wallet-standard@6.0.2` | Exact version read from the official starter kit package manifest. |
| Next.js | `next@16.3.3` | The starter's 16.0.8 pin produced high-severity audit findings. npm identified 16.3.3 as the patched non-major upgrade. |
| Sharp | `sharp@0.35.4` | Versions below 0.35.0 inherit listed libvips vulnerabilities. |
| PostgreSQL driver | `pg@8.16.3` | Server-only database transport for PostgreSQL 16. |
| Database mapper | `drizzle-orm@0.45.2` | Runtime query builder with explicit SQL migrations. |
| AWS KMS client | `@aws-sdk/client-kms@3.1119.0` | Server-only envelope-key protection through the EC2 instance role. |
| Runtime validation | `zod@4.4.3` | Strict parsing for public and privileged request boundaries. |
| Test runner | `vitest@4.1.10` | Unit, service, protocol, and environment tests. |
| Browser runner | `@playwright/test@1.62.1` | Desktop and mobile end-to-end journeys. |
| Build transformer | `esbuild@0.28.2` | Exact root pin and npm override keep Drizzle Kit, Vite, Vitest, Windows, and CI on one patched build-tool version. |
| ESLint | `eslint@9.39.5` | Compatibility pin. ESLint 10.9.1 makes Next's bundled React rule fail while loading with `contextOrFilename.getFilename is not a function`, despite the declared peer range. Recheck after the next lint-config update. |
| Product sans | `@fontsource-variable/manrope@5.3.0` | Local variable font for product copy, navigation, controls, and headings. No runtime font request is required. |
| Editorial serif | `@fontsource-variable/newsreader@5.3.0` | Local variable font reserved for emphasis, document totals, and the release register. No runtime font request is required. |

Primary references:

- `https://github.com/Akashneelesh/strk20-starter-kit/blob/main/package.json`
- `https://strk20-by-example.org/llms-full.txt`
- `https://github.com/odinfree/strk20-skills`
- npm registry metadata and audit output read during installation

Do not run an automatic forced audit fix. Read each proposed change, keep STRK20 integration packages fixed unless current wallet references require a coordinated upgrade, and rerun the real wallet flow after any change.

ESLint 9 is outside its upstream support window. It remains pinned only because the current `eslint-config-next@16.3.3` plugin stack fails under ESLint 10 before linting application code. This is a tooling limitation, not a clean long-term state.

## Reproducibility and audit state

- `npm ci` completes from a clean dependency directory.
- `npm ls --depth=0` reports a valid exact top-level tree.
- Drizzle Kit, Vite, Vitest, and TSX resolve the root `esbuild@0.28.2` pin through the package override.
- `npm audit` and `npm audit --omit=dev` reported zero known vulnerabilities on 2026-08-30.
- Drizzle Kit still declares a deprecated development loader with an obsolete `esbuild` range. The package override removes that vulnerable binary from the installed tree. Clean installation, all 15 migrations, and PostgreSQL integration tests passed with the override. Recheck this workaround whenever Drizzle Kit changes.

The lockfile is part of the release boundary. A dependency change is incomplete until type checking, lint, unit tests, the deterministic proof report, the production build, and desktop and mobile browser journeys all pass.
