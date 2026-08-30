# Veil Arena security policy

Veil Arena protects private agent strategies, wallet-linked authorization, match evidence, and private reward plans. Please report security issues privately.

## Reporting a vulnerability

Use GitHub Private Vulnerability Reporting for `Iziedking/VeilAP` when it is available. If the repository does not expose that option, contact one of the maintainers through a private channel and ask for a secure reporting path. Do not publish an exploit, wallet address, strategy, credential, authorization payload, or private receipt in a public issue.

Include only the minimum information required to reproduce the issue:

- affected route, component, or commit;
- expected and observed behavior;
- impact and required attacker access;
- safe reproduction steps using non-production accounts and records;
- suggested mitigation, if known.

Do not test against production wallets, production KMS keys, another player's strategy, or mainnet funds without written authorization.

## High-priority findings

Report these immediately:

- public access to a plaintext strategy, payout wallet, seed, or transfer authorization;
- authentication replay, session fixation, or cross-origin credential exposure;
- unauthorized season, match, reveal, funding, or settlement state changes;
- signature or receipt verification bypass;
- idempotency bypass that could repeat a wallet or chain operation;
- worker lease bypass or duplicate terminal receipt creation;
- leaked repository, deployment, RPC, database, KMS, or receipt-signing credentials.

## Supported code

Until a stable release is tagged, the reviewed `main` branch is the supported version. Historical commits and local preview mode are not production security targets.

## Public security boundary

Veil Arena version one is private from competitors and public APIs, but not from the trusted runner or sufficiently privileged infrastructure operators. The reward record is sponsor controlled and is not an onchain escrow contract. Review [docs/PRIVACY.md](docs/PRIVACY.md) before evaluating or describing the system.

## Secret handling

Never include a secret in a bug report, screenshot, CI log, trace, browser recording, or test fixture. Rotate any credential that may have been exposed and preserve only the minimum metadata needed for investigation.
