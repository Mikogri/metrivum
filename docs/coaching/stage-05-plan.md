# Stage 05 implementation plan

Scope: delivery and actual execution of published training, relationship-scoped progress and documentation, and deterministic generation of ordinary editable program drafts. Preserve the existing builder, private schemas and Free/Pro feature parity.

## Decisions

- Training owns assignments, group assignment batches, dated occurrences and actual execution. Published revision snapshots remain immutable. Dates follow contiguous block/cycle lengths, not calendar weeks. Start freezes the effective prescription. Explicit revision refresh only replaces unstarted future occurrences; historical occurrence identities/dates remain stable.
- Every delivery/documentation operation authorizes the current account against its Coaching relationship. Suspended client access is blocked; completed relationships retain shared historical reads. Group membership does not grant access to another client's records.
- Documentation uses a dedicated module and private Media contracts; coach-private notes never enter client DTOs or notifications. Measurements retain semantic keys and explicit compatible units.
- Generator uses reviewed catalog metadata and versioned deterministic recipes. It emits the existing TrainingDocument, previews before saving and never publishes or assigns automatically. Unknown load stays unfilled.
- Progress is computed server-side from actual logs, with explicit due-date denominators, late logging and compatible unit rules. No fabricated history or training estimates.

## Slices and ownership

1. Training delivery API, persistence, scheduling, execution and progress tests.
2. Relationship documentation API, private media integration, UI and privacy tests.
3. Generator metadata/recipes, preview/replace/reshuffle/save, UI and repeatability tests.
4. Integrate coach/client training screens, existing Analyze, routes, access capabilities and notifications.
5. Generate additive migrations and contracts; verify clean/upgrade PostgreSQL, isolation/concurrency and browser workflows. Apply only to confirmed dev project `atclvdkpbccafakzpwls` after SQL review. Preserve unrelated working-tree changes; no publish/push.
6. Record exact validation, deployment status and any remaining limitations in the Stage 05 delivery report.

The existing repository has a large uncommitted working set. Work in the current checkout with disjoint file ownership; do not reset, bulk-format or commit unrelated files. Root coordinates shared host/migration/contract files and runs the final graph update.
