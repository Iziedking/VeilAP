# Competition runtime and privacy specification

Verified 2026-09-06 against the installed Veil Arena code, the live dev.fun Poker Arena, the dev.fun Arena quickstart, Poker Playground, Poker Tournament, Sandbox Researcher Guide, and agent tuning guide.

## Product claim

Veil Arena runs timed competitions for sealed deterministic agents. Public viewers can follow competition progress, completed results, and per-competition standings. Only entrants can open that competition's table rooms and replay its detailed receipts. Funded competitions may settle the winner through STRK20 without revealing the private recipient or transfer amount in Veil Arena's public product view.

## What the research supports

dev.fun treats a competition as a long-running season. Agents play many tables, the leaderboard updates from completed play, and prize eligibility can require a large sample such as 20,000 hands. Its public table presentation exposes cards, actions, and agent reasoning. Veil Arena adopts the season, repeated-table, sample-progress, and per-competition leaderboard structure. It rejects the public action and reasoning stream because that would disclose sealed strategy behavior.

Primary sources:

- https://dev.fun/
- https://arena.dev.fun/
- https://docs.dev.fun/arena/quickstart
- https://docs.dev.fun/arena/poker-arena-and-prize/the-sandbox-researcher-guide
- https://docs.dev.fun/arena/competitions-and-prizes/poker-playground
- https://docs.dev.fun/arena/competitions-and-prizes/poker-tournament
- https://docs.dev.fun/arena/tuning-your-agent

## Timed schedule

Each version 3 ruleset declares duplicate deals per match and a minimum public decision sample per agent. At roster lock:

1. Build one deterministic pairing round from the locked roster.
2. Count two decision receipts for each duplicate deal because the engine swaps seats.
3. Calculate how many complete rounds each agent needs to meet the selected sample target.
4. Spread those rounds evenly from the later of the season start and roster lock to just before the season end.
5. Give every match in a round the same persisted scheduled time.

The target is a qualification requirement. The competition does not stop early because one agent reaches it. No new round is scheduled at or after the published end time. A table that became due before the end may finish afterward when the worker is recovering from downtime or clearing a backlog; the UI must show that as delayed scheduled execution, not play that started on time. Legacy version 1 and 2 competitions keep their original ten-second sequence schedule and historical receipts.

The worker may execute several due tables concurrently, up to its configured safe batch limit. Database claims, leases, stable seeds, retry limits, and idempotency continue to decide ownership of each table.

## Visibility matrix

| Data | Public visitor | Competition entrant | Player in that match | Trusted runner |
| --- | --- | --- | --- | --- |
| Competition dates, rules, progress | Yes | Yes | Yes | Yes |
| Final match score and winner | Yes | Yes | Yes | Yes |
| Per-competition leaderboard | Yes | Yes | Yes | Yes |
| Queued and active table room | No | Yes | Yes | Yes |
| Per-hand receipt replay | No | Yes | Yes | Yes |
| Own cards and recorded action after completion | No | No | Yes | Yes |
| Opponent policy, reasoning, raw seed | No | No | No | Yes during execution |
| Reward token, amount, recipient, transaction details in public view | No | No | Sponsor or recipient as required | Settlement service as required |

## STRK20 boundary

The private product has two independent layers. Envelope encryption and participant authorization protect stored policies and match views. STRK20 protects reward transfer semantics for funded competitions. Removing STRK20 removes private settlement, but it must not make sealed policies or participant-only replays public. The trusted runner and privileged infrastructure operators remain inside the privacy boundary. Operator-blind execution would require later confidential-compute attestation.

## Current engine boundary

The current engine completes a deterministic paired-decision match atomically and then persists its signed receipt. Timed rounds make competition duration, repeated play, sample size, and standings real. They do not create a live street-by-street no-limit hold'em engine. A material engine expansion still requires an authoritative betting state machine, durable ordered events, isolated per-turn deadlines, reconnection checkpoints, and owner-specific projections. Until those exist, UI copy must say scheduled execution or verified replay, never live hand play.
