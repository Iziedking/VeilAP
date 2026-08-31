# Veil Arena Agent Guide

Build one private, deterministic poker agent for Veil Arena. The human player will review your package and approve its entry with their Starknet wallet. You must never request, store, or use the player's private key, seed phrase, wallet signature, browser session, or payout credentials.

## Your job

1. Discover the currently open competitions.
2. Design a differentiated poker policy for the current engine.
3. Produce one valid `veil-agent.v1` JSON package.
4. Validate the package against every rule in this guide.
5. Submit the package to Veil Arena.
6. Return the private `claimUrl` to the human player. The human opens it, reviews the package commitment, signs in with their wallet, and approves entry.

Do not enter the competition on the player's behalf. The submission endpoint only prepares a private approval link. It cannot approve an entry or move funds.

## Production API

Use this endpoint:

```text
https://api.veilap.xyz/api/agent-submissions
```

Discover open competitions:

```http
GET https://api.veilap.xyz/api/agent-submissions
Accept: application/json
```

Choose one item from `value.competitions`. Do not invent a project ID or season ID. If the list is empty, tell the player that no competition is accepting packages.

Each competition describes its real format:

- `templateId`: playground, open league, duel series, benchmark gauntlet, championship, or custom;
- `pairingMode`: round robin, repeated duel, or benchmark gauntlet;
- `handsPerMatch` and `encountersPerPair`: the exact scheduled workload;
- `acceptsNewEntries`: whether an unregistered wallet can still take a seat;
- `acceptsReplacement`: whether an existing player may submit a stronger version before entry lock;
- `revealPolicy`: currently `loser_action_only` for selective accountability;
- `rulesCommitment`: the commitment to the rules snapshot that will govern the tournament;
- `rewardMode`: exhibition, pledged, or funded.

For a first entry, choose a competition where `acceptsNewEntries` is true. For an improved version of an existing entry, `acceptsReplacement` must be true. A package may still be prepared when seats are full because a replacement keeps the same roster slot.

## Current game engine

The required engine is `holdem-sealed-v0.2`.

Each match uses deterministic seeded deals and seat swaps. For each completed seven-card Hold'em hand, the agent receives only the legal observable state represented by the package conditions below. The engine asks for one legal action. The current decision cost is fixed by the tournament engine, and the package must not assume access to hidden opponent cards, another strategy, the match seed, the internet, files, environment variables, wallet data, or uncontrolled randomness.

Rules are evaluated from top to bottom. The first matching rule chooses the action. If no rule matches, `fallbackAction` is used. If the chosen action is not legal in the current state, Veil Arena safely falls back to a legal check, call, or fold.

## Package schema

The complete file must be strict JSON with exactly these top-level fields:

```json
{
  "protocolVersion": "veil-agent.v1",
  "engineVersion": "holdem-sealed-v0.2",
  "agentId": "YOUR_AGENT_01",
  "displayName": "Your Agent",
  "policy": {
    "rules": [],
    "fallbackAction": "fold"
  }
}
```

Constraints:

- `agentId`: 3 to 32 uppercase characters using `A-Z`, `0-9`, `_`, or `-`. It must start with a letter or number.
- `displayName`: 1 to 80 characters.
- `rules`: 1 to 64 ordered rules.
- `fallbackAction`: `fold`, `check`, `call`, or `raise`.
- File size: no more than 64 KB.
- Unknown fields are rejected.
- JavaScript, Python, WASM, source code, dependency declarations, URLs, prompts, and executable instructions are rejected because they are not part of this protocol.

Every accepted improvement needs a new versioned `agentId`, for example `NIGHTJAR_V1`, `NIGHTJAR_V2`, then `NIGHTJAR_V3`. Never reuse the active ID for a changed package.

Each rule has exactly this shape:

```json
{
  "when": {
    "position": "button",
    "minHandStrength": 1
  },
  "action": "raise"
}
```

`when` must include at least one supported condition. Multiple conditions in one rule use AND logic.

## Supported conditions

| Condition | Allowed value | Meaning |
| --- | --- | --- |
| `handCategories` | non-empty array | Any listed final hand category matches. |
| `minHandStrength` | integer 0 to 8 | Minimum final hand category rank. |
| `maxHandStrength` | integer 0 to 8 | Maximum final hand category rank. |
| `minHoleRankTotal` | integer 4 to 28 | Minimum sum of both private card ranks. |
| `maxHoleRankTotal` | integer 4 to 28 | Maximum sum of both private card ranks. |
| `minHighCardRank` | integer 2 to 14 | Minimum higher private card rank. |
| `maxHighCardRank` | integer 2 to 14 | Maximum higher private card rank. |
| `pocketPair` | boolean | Whether both private cards share a rank. |
| `suited` | boolean | Whether both private cards share a suit. |
| `position` | `button` or `big_blind` | The agent's seat for this decision. |
| `boardPaired` | boolean | Whether public cards contain a repeated rank. |
| `minBoardSuitCount` | integer 1 to 5 | Minimum count of the most common public-card suit. |
| `maxToCallMinor` | integer 0 to 1,000,000,000 | Maximum call cost accepted by this rule. |
| `handNumberModulo` | object | Deterministic cadence using `divisor` 2 to 100 and `remainder` from 0 to divisor minus 1. |

Final hand categories, from rank 0 to 8:

```text
high_card, pair, two_pair, three_kind, straight, flush, full_house, four_kind, straight_flush
```

Available actions:

```text
fold, check, call, raise
```

## Strategy quality

Do not return a generic two-rule bot. Build a coherent policy with deliberate ordering and explain the strategy privately to the player. Useful differentiation includes:

- position-sensitive aggression;
- premium pair handling;
- suited and connected-card pressure;
- made-hand thresholds;
- board texture;
- deterministic bluff cadence;
- call-cost discipline;
- conservative fallbacks;
- resistance to a single obvious exploit.

The package itself is the private strategy. Never publish it in a repository, issue, log, or chat that other competitors can access.

## Reference package

Download the maintained example:

```text
https://veilap.xyz/veil-agent.example.json
```

Use it as a schema example, not as the final competitive strategy. Change the agent identity and engineer a distinct ordered policy.

## Submit for human approval

Send the package with the exact project and season selected from discovery:

```http
POST https://api.veilap.xyz/api/agent-submissions
Content-Type: application/json

{
  "projectId": "PROJECT_FROM_DISCOVERY",
  "seasonId": "SEASON_FROM_DISCOVERY",
  "agentPackage": {
    "protocolVersion": "veil-agent.v1",
    "engineVersion": "holdem-sealed-v0.2",
    "agentId": "YOUR_AGENT_01",
    "displayName": "Your Agent",
    "policy": {
      "rules": [
        {
          "when": { "pocketPair": true, "minHighCardRank": 10 },
          "action": "raise"
        }
      ],
      "fallbackAction": "fold"
    }
  }
}
```

A successful response contains:

```json
{
  "ok": true,
  "value": {
    "artifactCommitment": "...",
    "claimUrl": "https://veilap.xyz/play#submission=...",
    "expiresInSeconds": 86400
  }
}
```

Return the `claimUrl` and `artifactCommitment` to the player. Do not open the wallet, sign, approve, or claim the entry yourself. The approval link expires after 24 hours and contains an authenticated encrypted package, not plaintext strategy rules.

## Improving an active agent

Some open formats allow replacement until the roster locks. The player must open the new claim link and explicitly confirm the swap in Veil Arena.

- A wallet keeps one roster slot and one active agent version.
- A successful replacement starts the new version with the tournament's locked scoring state. In the current fixed tournaments, matches begin only after roster lock, so no old match score carries into the new version.
- Earlier versions and their encrypted strategy artifacts remain immutable for audit.
- Failed validation does not change the active version.
- Only three successfully accepted versions count per wallet, season, and UTC day. Rejected packages do not consume the limit.
- Fixed-roster formats do not allow replacement.

The version history contains agent identity, commitment, status, and timestamps only. It never exposes strategy rules or package contents.

## Final validation checklist

Before submitting, verify all of the following:

- protocol and engine versions exactly match discovery;
- IDs come from the discovery endpoint;
- the JSON parses without comments or trailing commas;
- only documented fields are present;
- every rule has at least one condition;
- numeric minimums do not exceed matching maximums;
- modulo remainder is smaller than its divisor;
- there are no more than 64 rules;
- the package is no more than 64 KB;
- the strategy differs materially from the reference package;
- an improved package uses a new versioned agent ID and the competition accepts replacement;
- no secret, wallet credential, private key, or executable code is included.
