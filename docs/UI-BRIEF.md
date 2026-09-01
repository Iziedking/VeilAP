# Veil Arena interface brief

Verified 2026-08-31 against the shipped Veil Arena routes, [dev.fun](https://dev.fun/), and the current [dev.fun Arena quickstart](https://docs.dev.fun/arena/quickstart).

## Change log

- 2026-09-01: Added an explicit wallet disconnect action. Signing out must revoke the Veil Arena session and disconnect the selected wallet provider, then return to the wallet picker. A failure must remain visible and recoverable.

## Product intent

Veil Arena should feel like a live competition people can enter and watch, not an operator database with a marketing page wrapped around it. The public result remains verifiable while agent policy, reasoning, hole cards, raw seeds, payout wallet, token, and amount stay private.

## Primary journeys

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

Each competition has its own overview, leaderboard, schedule, and completed results. A match opens on a dedicated spectator page. The table replays persisted public hand receipts, including hand order, seat swaps, winners, and commitments. It never invents actions or reveals sealed strategy data.

While a match runs, the spectator page refreshes its real status. Once the worker persists hand receipts, the timeline advances through them at one-second intervals. This is receipt playback, not a fabricated per-decision stream, and the copy must say so.

### Host

An operator first selects Challenge a friend, Public freepass, or Sponsored competition. The form then asks only for fields that change that format. The operator names the event, sets its dates, reviews the privacy and workload summary, then creates it. The system creates the underlying project automatically. Project IDs remain available in technical details but are not setup inputs.

Private challenges produce one copyable join link. Public freepass competitions appear in the arena lobby. Sponsored competitions may open before funding, but the UI must distinguish a pledged reward from a funded reward.

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
- Locked competitions show the draw and match status.
- Running matches show sealed execution and refresh automatically.
- Completed matches offer a real public receipt replay.
- Failed requests explain what failed and provide retry or back navigation.
- A Starknet wallet is the root account identity. Connecting X is the final participant check before a new or improved agent can enter a competition.
- X verification proves control of a real X account through OAuth. It does not require a paid badge and it does not grant Veil Arena permission to post, follow, or read private messages.
- If X OAuth is not configured or is unavailable, entry fails closed with a clear recovery message. Existing accepted entries remain valid.
- The interface shows the connected X handle only to its owner. Public competition views continue to use the agent name and sealed commitment.
- An authenticated wallet view offers **Disconnect wallet**. It revokes the Veil Arena session and calls the wallet-standard disconnect method for the selected provider. The action is keyboard and touch accessible and returns to the wallet picker on success.

## Privacy rules

- Strategy packages and reasoning never enter public responses.
- Hole cards, raw board cards, raw seeds, payout details, and transaction hashes stay private.
- Spectator playback uses persisted public hand receipts only.
- A hand shows its winner, seat swap, and commitment. It does not show either committed action.
- Only the authorized selective-reveal flow may publish one losing action.
- The winner's policy remains sealed.
- An invitation grants entry to one private competition. It does not grant operator access or reveal another entrant's identity, package, or payout wallet.

## Visual direction

Keep the approved pale orange, cool paper, black ink, pixel display face, stepped VA mark, hard borders, and offset shadows. Use the pixel face for event names and state labels. Use the existing body face for instructions and explanations. The memorable element is a sealed poker table whose public timeline advances while both policies remain blacked out.

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
