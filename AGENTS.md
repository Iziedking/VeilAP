# VeilAP build rules

Follow `PLAN.md` phase by phase. The plan is private and excluded from Git.

Use the installed `izie-build-standard` and the STRK20 skills. Open their bundled references before writing wallet, pool, proof, or Cairo code. Current primary sources outrank remembered behavior.

The public product claim must stay narrow and provable:

- VeilAP is confidential accounts payable for stablecoin payment runs.
- The user's privacy-enabled wallet owns viewing keys, proofs, and signing.
- VeilAP must not store a wallet private key or viewing key.
- Preview data is synthetic and must remain labelled.
- A payment is never shown as complete from a transaction hash alone. Confirm the receipt and expected state.
- Deposits, withdrawals, pool interaction, and timing can remain visible. Never claim total anonymity.
- Keep `strk20.json` evidence empty until each value is verified on Starknet mainnet.

Pin every dependency exactly. Keep STRK20 behind one adapter. No component may import a wallet vendor directly.

Git and GitHub writes belong to the user. Do not stage, commit, push, fork, create branches, open pull requests, deploy, or change repository settings.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
