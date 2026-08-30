# Veil Arena build rules

Treat `PLAN.md` as the current release plan. The versioned historical plans explain how the product direction changed and must not override the current architecture, privacy model, or release gates.

Use the installed `izie-build-standard` and the STRK20 skills. Open their bundled references before writing wallet, pool, proof, or Cairo code. Current primary sources outrank remembered behavior.

The public product claim must stay narrow and provable:

- Veil Arena is a private competition platform for deterministic agents on Starknet.
- Players can build a constrained poker agent, seal its strategy, enter an open season, and compete for a sponsor-funded private reward.
- Submitted policies are not returned by public APIs. The trusted runner and sufficiently privileged infrastructure operators remain inside the privacy boundary.
- The player's wallet owns signing and transaction approval. Veil Arena never stores a wallet private key or viewing key.
- Shipped product surfaces must not invent agents, matches, scores, receipts, or rewards. Preview mode starts with no competition or reward records.
- A match or reward is never shown as complete from a transaction hash alone. Confirm the expected receipt, finality, pool interaction, and persisted state.
- STRK20 hides transfer semantics, but pool interaction, transaction timing, and surrounding chain activity can remain visible. Never claim total anonymity or operator-blind execution.
- Keep `strk20.json` evidence empty until each value is verified on Starknet mainnet.

Pin every dependency exactly. Keep STRK20 behind one adapter. No component may import a wallet vendor directly.

Git and GitHub writes belong to the user. Do not stage, commit, push, fork, create branches, open pull requests, deploy, or change repository settings.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
