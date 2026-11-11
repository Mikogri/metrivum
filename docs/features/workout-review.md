# Workout review

Training owns optional feedback on a completed execution: rating, session RPE, wellbeing, sleep quality and a bounded note. Completion never requires feedback. The client may add or correct it later using the current execution version; the authorized coach can read it but cannot impersonate the client. The nullable `Feedback` column preserves older logs and clients.

`GET /training/executions/{id}/comparison` compares the execution's frozen prescription with its actual log. Missing, skipped, added and substituted exercises/sets remain distinct. Targets use ranges and frozen formula results; unknown values remain null. Volume uses explicitly total external loads only, converts lb to kg, and excludes bodyweight/per-hand/assisted loads. Segment efforts count separately. Deviations from each workout's target expose deviations from its prescribed progression; no progression or 1RM is inferred.

`GET /training/comparison-report` applies the existing client/coach scope, date, program, block and cycle filters before server pagination. Progress and Advanced Analyze include bounded per-workout feedback observations with a truncation flag; absent feedback is never imputed.

The web workout screen permits skipping feedback, entering it after completion, and expanding per-exercise Planned vs Actual. The client progress screen and coach client history reuse the comparison report. Native clients remain compatible with the additive contract; device verification is separate from HTTP tests.

Client workout headers link to `/app/my-training/plans/:assignmentId`. The read-only view uses the assignment-authorized effective revision, filters coach-only annotations through `DocumentRules.ForClient`, and never loads the coach draft. Coach headers retain their library links.

Assigned-plan Back returns through browser history. Direct entry falls back to the Training plans tab, because /app/my-training/plans is not a list route.

The client assigned-plan header shows the effective revision description through the shared two-line preview, the live assignment status and the assigning coach’s display name/username. Active is green, paused amber and historical statuses neutral.
