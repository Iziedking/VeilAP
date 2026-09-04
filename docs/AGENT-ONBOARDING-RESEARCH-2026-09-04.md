# Agent onboarding research and proposed flow

Date: 2026-09-04. Status: researched proposal following the focused promise repairs. No upload redesign, registration on dev.fun, external upload, deployment or engine expansion was performed.

## User intent

Make adding an agent easier. Inspect how dev.fun accepts agents, then adapt the useful interaction to Veil's private saved-agent model. Preserve historical versions/results, wallet ownership and the distinction between saving an agent and entering a competition.

## Observed dev.fun flow

The public arena homepage has two tabs: “i have an agent” and “i don't have one yet.” The first presents one copyable instruction containing the arena skill URL. The second explains three steps and links to an agent provider and documentation. These controls were inspected in the browser, including switching tabs.

The published index skill describes API registration with name/handle/bio, returned credentials, and an ownership claim link. It checks for an existing registration before creating another identity. Ownership verification is separate from registration. This was read as reference material; none of its registration, payment, scheduling or messaging instructions were executed.

There are distinct execution paths. Public poker API documentation describes an external agent polling pending actions and submitting decisions. The heads-up ladder skill instead describes uploading strategy.py or bundle.zip through a multipart submission API, server validation, activation and status polling. The live public introspection endpoint confirms authenticated POST /api/arena/submissions with competitionId, file, template and explicit replace. Its replacement description says replacement occurs after the new submission validates. Do not infer precise current replacement transaction behavior from prose alone.

The inspected heads-up ladder page currently marks season 1 ended. Its published upload contract is evidence of the design, not proof of an open ladder season or a successful upload today. No authenticated upload screen or end-to-end registration was exercised.

Sources, checked 2026-09-04:

- [Public arena and onboarding](https://arena.dev.fun/)
- [Registration and routing skill](https://arena.dev.fun/skills/arena.md)
- [Hosted ladder submission contract](https://arena.dev.fun/skills/headsup-ladder.md)
- [Live API schema](https://arena.dev.fun/api/arena/__introspection)
- [API reference](https://docs.dev.fun/arena/api-reference)
- [Quickstart](https://docs.dev.fun/arena/quickstart)

Some quickstart prose contains placeholders and differs from the current skill. Treat the observed UI and live schema as stronger evidence than those outdated examples. No price or prize claim is needed for this proposal.

## Current Veil friction

Source inspected: src/components/veil-arena-play.tsx, public/AGENT.md, src/app/api/agent-submissions/route.ts and the existing saved-agent service.

- The current screen asks the user to navigate guide links, file selection, a JSON textarea, saved-agent buttons, review, wallet/X verification and tournament entry together.
- Copy currently provides a guide URL rather than a complete instruction that produces a clear review destination.
- The coding-agent submission API requires projectId and seasonId and checks for an open public season. The guide tells builders to stop if no competition is available. This conflicts with the independent private-library experience already supported by the owner-authenticated saved-agent API.
- File import, direct HTTP handoff and library reuse should converge on one understandable review step. They should not make users learn different storage rules.

## Proposed interaction

Start from Profile → My agents → Add agent. Existing agents remain first-class library items, with name, current version, last saved time and clear actions. Do not require a tournament to add one.

Offer two entry methods:

1. Send from a coding agent. After wallet sign-in, create a short-lived upload grant scoped to this owner's draft. Copy one complete prompt containing the guide and restricted upload destination. The coding agent prepares and sends the declarative package and returns the review link. The human reviews and explicitly saves it.
2. Upload a file. A keyboard-accessible file picker with optional drag/drop accepts .veil-agent.json. Show filename, size and actionable validation feedback. Put raw JSON paste under an advanced option rather than making it the default surface.

Both methods converge on Review agent: name, version intent, supported engine, validation outcome and private-storage explanation. Detailed commitments remain available without dominating the first view. The primary action is Save agent. Success returns to the durable library, with optional Challenge Null Jack or Choose a competition actions. Tournament eligibility and X requirements are checked when entering, not used to block independent package preparation.

Updates start from an existing library item. Show which agent is being updated and whether its submitted content differs. Require explicit replacement intent where applicable, preserve its stable identity and historical tournament artifacts, and never imply that updating the library changes an already-locked tournament entry.

## Security and architecture requirements before implementation

Reuse the repaired strict declarative schema, atomic saved-agent storage and independent encryption key ring. This proposal does not accept executable Python or ZIP bundles.

The suggested upload grant needs a durable owner-bound draft record, expiry, server-side revocation, bounded payload size, rate limits and idempotent upload/finalization. Store only a digest of the grant and encrypt draft packages with versioned data encryption. The grant may prepare that draft only; it must not grant wallet signing, account-wide reads, tournament entry, replacement of an active roster, or payment authority. Never hand a coding agent the owner's browser session or broad account credentials.

Validate before accepting a package; distinguish local validation, server acceptance and durable save. Claim consumption and saved-package persistence must be atomic. Repeated uploads/finalization after a dropped response must return the existing committed result. Expired or revoked grants must leave existing agents untouched. Preview responses expose metadata only.

Accepting executable agents later would require a separate threat model and sandbox: isolated execution, restricted network/filesystem access, resource/deadline quotas, dependency policy, secret separation, abuse controls and cost limits. It also would not by itself create a live multi-street engine. Keep that decision separate from simplifying uploads.

## UI and verification brief

Use the existing Veil design tokens and responsive layout. Primary intent is add, review and save; competition entry follows success. A novice should not need to understand JSON, project IDs, API authentication or commitments to complete the primary flow.

Required states: signed out, no saved agents, draft prepared, uploading, validating, invalid file, unsupported engine, owner mismatch, expired grant, offline/retrying, already saved, intentional update and durable success. Preserve the selected local file during recoverable errors where the browser permits it. Never show success from local validation alone.

Provide visible labels, keyboard file selection, non-color-only errors, focused error summaries and aria-live status updates. Support mobile without drag/drop, reduced motion, and blocked clipboard access. Do not persist plaintext packages in browser localStorage.

Regression acceptance: save with no open season; both entry methods converge; oversized/executable/unknown-field files rejected; failed update preserves current version; wrong-owner draft access denied; expired grants rejected; duplicate upload/save after timeout returns one result; refresh/relogin finds the saved agent; old receipts and locked entries unchanged. Run PostgreSQL concurrency tests and desktop/mobile interruption tests before release. The earlier focused repair remains a separate milestone.

## Rejected alternatives

- Adding a large drop zone alone: improves file selection but leaves the competition dependency and fragmented workflow intact.
- Anonymous permanent account registration with broad API keys: unnecessary authority for sending one private package.
- Copying dev.fun's executable upload mode now: changes the security and operations model materially.
- Automatically entering a competition after upload: removes the explicit owner decision and makes an agent's storage depend on tournament state.

This proposal is ready for implementation scoping; it is not a shipped capability or a claim of production validation.

## Approved implementation, 2026-09-04

The user approved My agents → Add agent → Send from coding agent / Upload file → Review → Save → Choose competition. Implement with the existing strict package parser, AES-GCM vault, PostgreSQL transactions, and Next 16.3.3 routes (installed route/page references read today). No new dependencies or engine expansion.

Both methods create a one-hour durable draft. The browser generates a 256-bit upload grant held only in memory; its SHA-256 digest is the draft identity and idempotency key. Only that digest is stored. Upload is immutable after validation, with identical retries accepted. Metadata-only owner review is recoverable from My agents after refresh. Wallet-authenticated finalization locks the draft and the existing owner/agent vault lock, saves and consumes in one transaction. New-agent collisions require explicit Update; updates check the original version and commitment. Grant possession cannot save, enter, pay, read a package, or access an account.

Keep at most five active drafts and twenty new drafts per owner per rolling day. Creation removes that owner's records older than 24 hours, bounding retained payloads per owner without adding a worker. Revocation and successful save immediately remove draft ciphertext. Expiry blocks access even before cleanup; backups follow the existing retention policy. Retain previous vault keys while any unexpired draft needs them. No paid external calls are added. PostgreSQL is the shared authority; memory storage is for preview/tests only.

Stages: repository/service adversarial tests; routes and guide; unified responsive UI; real disposable PostgreSQL concurrency and migration replay; browser journeys; full build and final evidence. Production application of additive migration 0023 remains the user's action. Existing legacy claim links and direct library APIs remain compatible.
