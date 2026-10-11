# TrainFlow system hardening and unified delivery

Source: [specification](specification.md), amended by the user's explicit messaging/check-in requirements and authorization to publish one GitHub repository. The user-facing instructions override the source document's no-push restriction. No production/store deployment or destructive database change is authorized.

## Delivery boundaries

The existing root Git repository already contains API, worker, web and mobile; use it as the single source of truth. Preserve the 365 pre-existing changed paths, captured under ignored `.local/refactor-2026-10-11/`. Continue in the actual working checkout on `codex/unified-messaging-architecture` so unpublished mobile and business changes are not lost. Do not reset, stash, force-push or delete sibling repositories. Review the complete publication set for secrets and generated/local artifacts before staging.

## Work packages

1. **Messaging policy and durable conversation entries.** Backend Messaging owns conversation access and request approval. Default contact is open; explicit approval preference remains enforced. Pending consent appears in the same conversation, with one initial message and no subsequent sends, replies or conversation-bound uploads (own-message deletion remains available). Invitations/form shares use an idempotent module contract and the existing durable delivery mechanism, not UI-only synthetic messages. Retain blocks, membership cutoffs and legacy request endpoints. Tests: open strangers, explicit approval, pending sender restrictions, acceptance/decline, duplicate/replayed invite sharing, and foreign/block denial.
2. **Web/mobile conversation UI.** Consume backend capability/request state; remove Requests navigation, render approval inline and keep the composer mounted but disabled while waiting. One conversation list and deep-link destination. Existing invitations/forms render as message entries from every supported creation flow. Tests cover pending→accepted, sender/recipient differences, account changes, and legacy request links.
3. **Check-in recurrence.** Extend existing scheduler with assigned-program cycle days, using assignment/cycle source contracts instead of another DbContext. Calendar days, IANA timezone, local release time and existing occurrence deduplication remain authoritative. Validate selected assignment, cycle-day bounds and ended relationships; preserve already released requests. Add editable release-time controls and option explanations in web/mobile. Tests: ten-day cycle, selected days, DST, edits, restart and duplicate ticks.
4. **Architecture/system audit and targeted fixes.** Maintain evidence for every specification area. Inspect current boundaries, contracts, calculations, jobs/outbox, cache, drafts, authorization, telemetry, restoration and retention. Fix demonstrated mechanisms with focused tests; do not add cache, queues or abstractions without evidence. Add meaningful architecture/contract/CI checks and bounded read-only consistency diagnostics where missing. Keep known local-ML blockers explicit.
5. **Integration, DEV migrations and publication.** Export contracts once backend changes stabilize; verify web/mobile consumers, real PostgreSQL migrations and security scenarios, build/typecheck/lint, dependency/secret checks and relevant UI flows. Review additive EF SQL against confirmed DEV identity/history before application. Update architecture/structure/operations and current verification evidence; refresh Graphify. Commit logical milestones, publish the existing private monorepo and compare local HEAD with remote branch HEAD.

## Interface coordination

- Messaging implementation reports additive conversation capability/request/message fields before frontend changes; generated contracts are owned by the integration step.
- Scheduling implementation owns CheckIns plus its narrow Training contract and schedule UI files; no Messaging edits.
- Audit implementation owns architecture tooling/CI and audit documentation, not feature modules without coordination.
- The parent owns Messaging UI, publication, final migration review and integration. Independent work may use agents as prescribed by the parallel-dispatch skill; do not run competing EF migration generation or heavy test/build processes.

## Review focus

Pending conversation access must never permit a second message/upload/reply through an alternate endpoint. System invitations must not bypass blocking or reveal unrelated private offer/form data. Recurrence must use real cycle lengths and stable local dates, not seven-day arithmetic. Existing clients and seeded preferences need a deliberate compatibility rule. Publication must include the actual mobile source and needed native module while excluding credentials, model weights, build output and local databases.

## Acceptance evidence

Record failing regressions before fixes and passing commands after. Separate current tests from historical reports, authored from executed device flows, and created migrations from applied migrations. Unknown business policy and unavailable infrastructure are explicit gaps, not fabricated passing results. Each spec section receives a status and evidence in the audit checklist.
