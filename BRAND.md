# Veil Arena brand kit

## The idea in one line

The competition is public. The winning strategy is not.

Veil Arena looks like tournament infrastructure, not a casino. The system combines an industrial match console, a public evidence register, and one deliberate signal color.

## Identity

The canonical mark is the frameless `VA Drop`: a fused stepped ribbon that reads as both `V` and `A`. The left edge descends into the `V`, the shared center rises into the `A`, and the lowest shared step is pale orange. The geometry represents a private strategy moving through a controlled evaluation boundary into a public result.

The visual wordmark is `VEIL:ARENA`. The colon is pale orange and acts as the execution boundary. The product name is `Veil Arena` in prose. Do not write `VeilAP`, `VEILAP`, or use the previous split-V square on new surfaces.

The mark is always frameless. Do not place it inside a square, add a shadow, round it, rotate it, outline it, or recolor the orange step. Keep clear space equal to one block of the mark on every side.

Canonical source asset: `public/brand/veilap-mark.svg`. The filename stays stable until every importing surface can move in one verified change.

## Color

| Token | Value | Role |
| --- | --- | --- |
| Ink | `#19181f` | Arena ground, mark, sealed records, and primary type |
| Security paper | `#e8e9ed` | Main broadcast field and loader |
| Clean paper | `#f7f7f9` | Leaderboard, receipt, and console surfaces |
| Quiet text | `#696773` | Supporting copy and annotations |
| Rule | `#b9b7c1` | Grids, tables, and evidence dividers |
| Signal | `#f2a572` | Live match state, active rank, and the VA Drop step |
| Signal text | `#19181f` | Text rendered on pale orange surfaces |
| Verified | `#315b48` | Valid receipt and settled state only |

Pale orange is the single product accent. It marks activity or one selective disclosure. It is not decorative chrome.

## Type

- Wordmark and short display labels: Silkscreen Bold.
- Headings, body copy, controls, and agent names: Manrope Variable.
- Verifiable identifiers: Departure Mono Regular with ui-monospace fallbacks.

Silkscreen gives the brand its game character, but it is deliberately scarce. Use it for the wordmark, rank numbers, and labels no longer than a few words. Never use it for sentences, instructions, form controls, or large multi-line headings. Departure Mono is reserved for commitments, match IDs, engine versions, receipt states, addresses, and transaction hashes.

## Interface brief

The public site must answer three questions without requiring protocol knowledge: how to enter, what remains private, and what the result proves. The player path is `choose a competition`, `give AGENT.md to a coding agent`, and `approve the returned package`. The operator path is `create a season`, `lock the entries`, and `run the matches`.

The interface uses plain language for actions and explanations. Protocol names remain visible only where a user may need to verify them. Empty and error states state what happened and the next useful action. Funding language must distinguish an exhibition, a pledged reward, and a funded reward.

Desktop and mobile body copy uses Manrope at 14px or larger where space allows, with a 1.5 line height. Compact status labels may reach 11px. Identifiers may use Departure Mono at 10px or larger. Touch targets remain at least 44px high. The orange signal marks the current action or live state, not decoration.

Rejected direction: using pixel or arcade fonts across whole pages. It preserved the game theme but made instructions, controls, and long headings tiring to read. The revised system keeps that character in the logo and small competitive details while putting comprehension first.

## Layout

- Hard one-pixel rules, visible grid structure, and square panels.
- Tables use tabular figures and explicit columns.
- The Arena and Leaderboard switch remains the primary interaction.
- Hard offset shadows appear only on the central broadcast surface and proof inspector.
- No soft cards, glass panels, neon gradients, particles, casino imagery, or decorative icon boxes.

## Motion

Motion reports system state:

- the VA Drop builds in nine visible steps on entry;
- the loader changes from `SEALING THE ARENA` to `ARENA READY`;
- match progress advances in measured steps;
- one live marker pulses while persisted receipts refresh;
- the selective reveal opens only after a result settles.

Reduced-motion users receive the final state without stepped or sliding animation. JavaScript-disabled users never receive a blocking loader.

## Voice

Short, competitive, and exact. State what remains sealed, what becomes public, and what the receipt proves. Never claim that the operator cannot read strategies in the trusted-backend version.

Player-facing copy must answer three questions quickly: what do I choose, what stays private, and what can I win. Prefer one clear sentence over protocol vocabulary. Do not use em dashes in interface copy.

Right: "The public sees the result. Competitors never receive the strategy."

Wrong: "Your strategy is private forever."
