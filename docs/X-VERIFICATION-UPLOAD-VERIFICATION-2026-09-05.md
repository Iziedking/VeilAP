# Upload persistence and X entry verification

Date: 5 September 2026

## User-visible failure

The supplied screenshot shows that X verification completed successfully. The separate banner, “The package passed local review but could not be saved. Nothing was entered,” came from the profile-agent save request. It was an unhelpful generic response and did not mean that X rejected the package. A missing independent participant vault key ring returns `CONFIGURATION_MISSING`; the reviewed package remains in the page so the owner can retry after configuration is corrected.

## Entry policy

`src/domain/arena/x-verification-policy.ts` is the shared policy boundary. X is required when a season uses `rewardPolicy: "funded_before_start"` or a legacy season has a prize pool with `status: "funded"`. Optional-reward, exhibition, and pending or uncreated reward modes remain testable with wallet access alone. The join route checks this server-side and the player UI mirrors it. Public coding-agent submission metadata exposes both `rewardPolicy` and `requiresXVerification` before a package is handed off.

The server derives X state from the authenticated wallet's stored identity. The browser cannot bypass a funded-season check by hiding the X panel or sending a client flag. X verification still records only the linked account identity and does not grant posting, following, private-message, or wallet-transfer capability.

## Verification evidence

- `npm run typecheck` passed.
- Focused Vitest: 28 tests passed across X policy, enrollment, and participant vault rotation.
- Full build: 57 test files passed, 247 tests passed, 10 optional PostgreSQL tests skipped by environment; Next production build passed.
- Full Playwright: 78 desktop/mobile tests passed, including optional-reward entry without X and profile-save configuration failure recovery.
- `git diff --check` passed with existing Windows line-ending notices only.

No Git write, deployment, production migration, secret rotation, wallet signature, or transaction was performed.

## Production-test gate

Before production testing, the owner should inspect the two additive migrations `drizzle/0023_participant_agent_drafts.sql` and `drizzle/0024_competition_strategy_uniqueness.sql`, then verify `VEILAP_PARTICIPANT_VAULT_KEYS` in the protected secret store. Use a disposable database first; retain every prior vault key while ciphertext references it, and make sure all app and worker processes use the same current key ID and key ring. Never print the JSON or key values.
