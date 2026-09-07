# Veil Arena interface brief

Verified 2026-08-31 against the shipped Veil Arena routes, [dev.fun](https://dev.fun/), and the current [dev.fun Arena quickstart](https://docs.dev.fun/arena/quickstart).

## Change log

- 2026-09-07: Removed the host-facing start-time field. Publishing opens a competition for eligible agent entries immediately; the host chooses only the roster lock cutoff and competition end. The persisted start timestamp records publication time for scheduling compatibility, but it is not a separate user decision.
- 2026-09-06: First-user simplification pass. The public arena now starts with three intent-led actions: watch a real result, enter with an existing agent, or host a competition. Player entry auto-selects the most recently updated saved agent and keeps package import behind an explicit change action. Completed table playback starts paused at a readable pace so a judge can understand one decision before moving to the next. This pass keeps the current deterministic engine honest as verified replay and does not introduce live street-by-street gameplay.

- 2026-09-06: Locked the competition runtime around timed scheduled rounds. A season runs from its published start to end time, with enough evenly spaced rounds to reach the selected qualification sample when every scheduled match completes. Matches in the same round become eligible together and workers execute a bounded number concurrently. Public visitors see competition results and its leaderboard. Only an authenticated entrant in that competition may open its table rooms and verified receipt playback.
- 2026-09-06: Added per-competition standings requirements. Hosts choose a tested sample target from a plain-language selector; presets provide a safe default. The leaderboard shows matches, public decision sample, qualification progress, wins, losses, ties, and points. Qualification is eligibility for ranking or reward review, not evidence that an agent is unique or human-owned.
- 2026-09-06: Match completion creates one deduplicated browser notification for an authenticated entrant: win, loss, or tie, with a link back to the competition. The feed remains a browser-session convenience until a durable notification service is added.
- 2026-09-01: Added an explicit wallet disconnect action. Signing out must revoke the Veil Arena session and disconnect the selected wallet provider, then return to the wallet picker. A failure must remain visible and recoverable.
- 2026-09-03: Added a persistent dark theme switch to the shared Arena navigation. Dark mode keeps the existing paper, ink, and orange signal roles, changes semantic tokens rather than adding a parallel stylesheet, and is remembered per browser. Oversized headings retain the clearer readable face; compact labels keep the pixel and mono faces.
- 2026-09-03: Added a real match start window to the draw. Queued tables show a wall-clock countdown derived from their persisted creation time and sequence, and the worker will not claim a future table early. At zero the table becomes ready to start, then changes to live when claimed. Completed tables remain immutable replays.
- 2026-09-06: Added a host next-action nudge for private head-to-heads. After creating or generating an invitation, the operator is shown the exact next step: share the expiring link, then open that same link to submit their own agent. Added a browser-session notification bell that records confirmed competition events without storing strategy, wallet, or invitation secrets.
- 2026-09-06: Private competition sharing now shows a scannable QR code beside the expiring join URL and an explicit COPY LINK action. The QR encodes only the invitation URL already issued by the server and is generated in the browser.
- 2026-09-06: Mobile layout pass targets 320, 360, 375, 390, 412, and 430 CSS-pixel phones. Shared navigation collapses into a compact scroll-free action row, dense tables become readable stacked cards, and long identifiers wrap inside their panels. Every primary control remains at least 44px high and no route may create horizontal page overflow.
- 2026-09-06: Result replay now separates the current decision outcome from the final match result. A completed match keeps its winner and final score visible while the viewer seeks through paired seat runs. Public evidence shows each agent's decision-win count and tied decisions; an authenticated owner also sees a private count of their own fold, check, call, and raise actions. Opponent actions and policy rules stay sealed. The notification drawer is anchored to the phone viewport so it cannot be cut off by the compact navigation.
- 2026-09-06: Reviewed dev.fun Poker Playground before considering a live-engine expansion. Its multi-player table exposes street-by-street actions, stacks, bets, and agent reasoning. Veil Arena cannot copy that presentation under the current sealed-strategy promise: public action streams reveal behavioral fingerprints and public reasoning reveals the policy directly. A future live engine therefore requires an authoritative street state machine, durable ordered events and reconnect checkpoints, isolated timed agent turns, private per-owner projections, and an explicit product choice between sealed playback, delayed action disclosure, or a transparent arena. Until that choice is made, the shipped engine remains an honestly labeled completed paired-decision benchmark and must never be presented as live play.

## Product intent

Veil Arena should feel like a live competition people can enter and watch, not an operator database with a marketing page wrapped around it. The public result remains verifiable while agent policy, reasoning, hole cards, raw seeds, payout wallet, token, and amount stay private.

## Primary journeys

### First-user pass

The first screen must let a visitor choose one job without understanding the protocol. The three actions are **Watch a result**, **Build and enter**, and **Host a competition**. Watching a real persisted result never requires a wallet, X account, or agent. Entering with an authenticated wallet automatically opens the most recently updated saved agent and shows a visible `Change agent` action. Hosting keeps one next action visible after publish: share the invitation, then join the host's own ring.

The entry path is intentionally short: choose a competition, confirm the selected agent, and approve entry. Importing or reviewing a package appears only when the player has no saved agent or explicitly chooses to change it. A completed table opens with replay paused, a readable decision status, and one clear `Play replay` control. The first-user test passes when a judge can reach a real competition result in two clicks and a participant with one saved agent can reach entry approval without importing the package again.

### Choose a competition

The final demo groups competitions by what the player is trying to do:

- **Challenge a friend:** create a free, private two-agent duel and copy an expiring join link.
- **Enter an open table:** join a public freepass tournament with no stake and no advertised prize.
- **Compete for a sponsor reward:** enter an open competition whose funding state is shown separately from entry.

Player-staked winner-takes-all remains unavailable until an audited escrow contract can enforce deposits, refunds, and settlement. The interface may name the format, but it must not offer a working control or imply custody.

### Discover

The landing page explains the game, shows one real competition preview, and sends the visitor to the arena. It does not contain the full leaderboard or match archive.

### Enter

The arena lobby lists real competitions by state. A player opens one competition, reads its format and privacy rules, then gives `AGENT.md` to a coding agent. The player only returns to approve the sealed package with a wallet.

### Watch

Each competition has its own overview, leaderboard, schedule, and completed results. Public visitors see completed result summaries and that competition's leaderboard. An authenticated entrant can open every table in the competition. Queued matches show a countdown to their scheduled round. Completed entrant views replay persisted hand receipts, including hand order, seat swaps, winners, and commitments. The UI never invents actions or reveals sealed strategy data.

While a match runs, the spectator page refreshes its real status. Once the worker persists hand receipts, the timeline advances through them at one-second intervals. This is receipt playback, not a fabricated per-decision stream, and the copy must say so.

### Host

An operator first clicks a competition type: Challenge a friend or Public freepass. The form shows the type, name, roster lock cutoff, and competition end before anything else. Publishing opens the competition for eligible agent entries immediately, so there is no separate start-time control. Funding is off by default. A single Fund this competition checkbox reveals the STRK/USDC selector and exact amount field; there is no seeded reward amount. When funded, the operator connects, opens the wallet, submits, and verifies the expected receipt. The system creates the underlying project automatically. Project IDs remain available in technical details but are not setup inputs.

The host chooses a qualification sample from a dropdown. Preset cards supply the pairing mode, table size, duplicate deals per match, admission, replacement, and funding rules. At roster lock, Veil Arena calculates the required number of rounds from the actual entrant count and spreads those rounds across the published competition window. The final round becomes eligible before the end time. The worker never claims a future round early.

Private challenges produce one expiring join link with both a copy action and a scannable QR code. Public freepass competitions appear in the arena lobby. Optional funding is one compact Reward and payout section in the host desk, not a separate Sponsor the winner page or QR detour. The only currently verified payout mode is winner-takes-all; split payouts remain unavailable until multi-recipient settlement is enforced end to end.

After a private challenge is created, the host desk keeps the next action visible until the host opens player entry. The join control uses the freshly generated invitation URL, so the host does not have to reconstruct a project, season, or token link. The notification bell surfaces confirmed local events such as competition creation, link generation, roster changes, draw lock, and completed replay; it is a short-lived browser-session feed and never stores the opaque invitation token.

Friend challenges and duel series lock their immutable two-agent roster automatically after the second successful enrollment, which creates the scheduled draw for the worker. Every non-gauntlet competition also auto-locks when its configured deadline arrives; the operator can still lock early. Gauntlets keep the explicit Lock draw action because they require a selected sealed benchmark. Profile competition entries are shown four at a time with Previous and Next controls.

### Challenge the champion

Null Jack is Veil Arena's real deterministic system champion, stored through the same sealed artifact path as player agents. A player can create a free private duel against it. Null Jack receives no access to another strategy, private cards, external services, or uncontrolled randomness.

## Information hierarchy

1. Competition kind, state, and next action.
2. Who is playing and current score.
3. Schedule or leaderboard.
4. Verifiable commitments and privacy boundary.
5. Operator and settlement controls.

## Interaction model

- `/` is the invitation and one live preview.
- `/arena` is the competition lobby.
- `/arena/:projectId/:seasonId` is the competition room.
- `/arena/:projectId/:seasonId/match/:scheduledMatchId` is the spectator table.
- `/play?project=:projectId&season=:seasonId` is entry approval.
- `/play?invite=:opaqueToken` is private challenge entry approval.
- `/arena-console` is the host desk. A project query opens an existing event; no query starts a new event.

## Important states

- Loading uses cards shaped like the final content.
- Empty competition lists offer one action: host the first competition.
- Open competitions offer entry.
- Private competitions are absent from the public lobby and require a valid, unexpired invitation.
- Locked competitions show the draw, each match start countdown, and match status.
- Running matches show sealed execution and refresh automatically.
- Completed matches offer a real public receipt replay. Every replay step says which decision receipt is open, which paired deal it belongs to, and whether it is the first or second seat run. A tied decision cannot be mistaken for a tied match.
- A countdown at zero says the table is ready for the worker rather than pretending execution has started. A worker delay is visible as a ready/queued state until the claim is persisted.
- Sponsor amounts are entered in normal token units (for example, `10.00` USDC); the desk converts them exactly to minor units before saving and shows both representations when reviewing the funding plan.
- Sponsor setup offers only canonical Starknet Mainnet STRK or USDC. The sponsor wallet reviews and approves the exact selected token and amount; after verified completion, settlement transfers the reward privately to the winning participant wallet recorded at entry.
- Failed requests explain what failed and provide retry or back navigation.
- A Starknet wallet is the root account identity. Connecting X is the final participant check before a new or improved agent can enter a competition.
- X verification proves control of a real X account through OAuth. It does not require a paid badge and it does not grant Veil Arena permission to post, follow, or read private messages.
- If X OAuth is not configured or is unavailable, entry fails closed with a clear recovery message. Existing accepted entries remain valid.
- The interface shows the connected X handle only to its owner. Public competition views continue to use the agent name and sealed commitment.
- An authenticated wallet view offers **Disconnect wallet**. It revokes the Veil Arena session and calls the wallet-standard disconnect method for the selected provider. The action is keyboard and touch accessible and returns to the wallet picker on success.

## Privacy rules

- Strategy packages and reasoning never enter public responses.
- Hole cards, raw board cards, raw seeds, payout details, and transaction hashes stay private.
- Public result summaries contain final score, winner, agent names, match count, and signed aggregate proof fields. They do not contain the per-hand receipt stream.
- Per-hand spectator playback is available only to an authenticated wallet that entered the competition.
- A participant may watch every table in a competition they entered. Only a player in the specific match receives their own verified cards and action projection.
- A hand shows its winner, seat swap, and commitment. It does not show either committed action.
- Only the authorized selective-reveal flow may publish one losing action.
- The winner's policy remains sealed.
- An invitation grants entry to one private competition. It does not grant operator access or reveal another entrant's identity, package, or payout wallet.
- Encrypted policy storage and competition authorization protect strategy and table data off chain. STRK20 protects funded reward transfer semantics. STRK20 does not encrypt policies, cards, actions, or reasoning.

## Competition leaderboard

Every competition owns one leaderboard. It never combines results from another season, even when the seasons share a project. Rows show rank, agent name, match record, points, public decision sample, and progress toward the competition's qualification target. Public visitors can inspect these rows and completed match summaries without opening the underlying table replay. Entrants see the same standings plus links to the competition's table rooms.

The current scoring contract remains three points for a match win, one for a match tie, and zero for a loss. A genuine points tie remains a tie for reward settlement. Qualification only states whether an agent completed the required sample; it does not change a recorded match winner or rewrite historical results.

## Visual direction

Keep the approved pale orange, cool paper, black ink, stepped VA mark, hard borders, and offset shadows. Use the readable Manrope face for headings, controls, state labels, instructions, and explanations. Reserve the monospace face for commitments, wallet addresses, timestamps, and other values that must be copied or verified. The memorable element is a sealed poker table whose public timeline advances while both policies remain blacked out.

### Dark theme decision

The theme toggle lives in the shared top navigation so it is available before a visitor chooses a route. It changes the same semantic roles: page surface, panel surface, ink, quiet text, rule, signal, and failure. The orange signal remains the live and action colour, while near-black surfaces provide the game-room feel. The saved preference is local to the browser and the existing light theme remains the default for first-time visitors. The toggle has an explicit accessible name and pressed state, and the initial preference is applied before hydration to avoid a flash between themes.

### Benchmark decision

Null Jack remains a deterministic sealed agent, not an unbeatable claim. The benchmark records match wins, losses, ties, mean score difference, hand-level outcomes, policy failures, and matches where every hand tied. It runs the real `runMatch` engine with fixed development and held-out seeds, a same-policy control, and named baseline packages. A policy change is accepted only when it improves held-out mean score and match win rate without increasing policy failures or turning real ties into fabricated wins. The benchmark output is evidence for the champion label, not a promise that future builders cannot beat it.

The 2026-09-03 run promoted the 700/525 policy from the frozen 625/500 policy. On 24 held-out seeds against Value Bot, it scored 14 wins, 4 losses, and 6 ties with mean score difference +1.50, compared with the prior policy's 11 wins, 10 losses, and 3 ties at +0.29. It had zero policy failures and zero matches in which every hand tied. The claim remains bounded: a future agent can beat Null Jack, and a tie remains a valid result.

## Rejected alternatives

- One scrolling page containing marketing, leaderboard, match archive, proof, and payouts. It hides navigation and makes every result feel like the same page.
- Asking operators to paste a project ID. That exposes an implementation detail before the task begins.
- A decorative fake live table. Every visible hand and score must come from persisted competition data.
- Publishing all poker actions for spectacle. That weakens the privacy thesis and makes strategy fingerprinting easier.

## Verification

- Keyboard and touch access for every route and control.
- Visible focus states and meaningful status text without relying on colour.
- No horizontal overflow at 320, 390, 768, 1024, and 1440 pixels.
- A match result link changes the URL and opens a dedicated spectator page.
- A host can create a first competition without handling a project ID.
- Spectator payload tests reject strategy, reasoning, cards, raw seed, and payout fields.
- Reduced-motion mode shows the same receipt information without timed playback.
