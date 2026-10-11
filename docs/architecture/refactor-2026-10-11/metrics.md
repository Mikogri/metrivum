# Metric definitions and identity

No formula or historical settlement rule changed in this hardening pass. Definitions below describe current sources; they are not a claim of a complete versioned metric registry.

| Metric | Authoritative source / definition | Missing values, date and scope |
|---|---|---|
| Completion | `TrainingProgressService`: completed due occurrences / due occurrences × 100; two-decimal rounding | Null when denominator zero. Planned dates inclusive; deadline is local schedule boundary. Future/superseded occurrences excluded from denominator. |
| Missed / skipped / in progress | Due with no execution / explicit skipped execution / in-progress execution | In-progress is separate; never infer completion from planned sets. |
| Volume | Actual completed, unskipped eligible sets; stored `VolumeKg` from explicit TotalExternal loads | No per-hand/bodyweight/assisted guess. Null when no qualified volume; kg × repetitions. |
| Best load | Max actual eligible external kg or converted lb load per exercise/date/load meaning | Not e1RM. Keep load meanings separate; absent values are not zero. |
| Training duration/frequency | Completed executions with recorded duration; completed session count per seven inclusive calendar days | Duration null if no recorded duration. Performed dates determine performance; scheduled dates determine attendance. |
| Unique clients / retention | `CoachingAnalytics` deduplicates clients, reconstructs status from historical changes; retained starting cohort / starting cohort | Group rows may overlap; never sum them as total clients. Personal/Team scopes are explicit in `AnalysisService`. |
| Conversion | Submitted application cohort and latest accepted outcome | Submitted-date range; no invented advertising attribution. |
| Financial gross / fee / net | `BillingAnalytics`: immutable payment snapshots, grouped by currency and historical ownership | Settlement dates in requested IANA zone; current price/fee configuration must not recalculate history. Platform payments excluded from service revenue. |
| Check-in completion | `CheckInsAnalytics`: concrete requests, available/submitted/reviewed cutoffs | Exclude future and appropriately cancelled requests; overlap of target groups does not duplicate requests. Answers are not analytics input. |

Progress returns complete summary aggregates and bounded details. `clientsHasMore` means more than 200 client groups; `performanceHasMore` means more than 1000 exercise/date/load-meaning groups. One extra row is fetched to determine each flag, then omitted from output. Sorting includes the full performance group identity. Both clients explain that totals cover all matching records and recommend narrowing filters. Old clients can ignore the additive fields; until updated they retain their previous display limitation.

`ProgramGenerator` records `baseline-recipes-1`, effective input/selection seed and dataset identity. A seed alone is insufficient after catalog changes. Preserve the relevant published revision and algorithm release when reproducing a generated draft. Real ML additionally needs the verified model/runtime/pre/postprocessing/calibration/source identity; no target runtime has yet supplied the required real-model proof.

Progress/Analyze do not yet carry a complete `AlgorithmId`, version, canonical configuration hash, source revision and computation timestamp envelope. This is an explicit remaining gap; adding a fabricated current timestamp would not solve it. There is no new durable metric cache, so this pass does not introduce cache invalidation dependencies. The PR template requires reviewers to document version effects for algorithm edits, without pretending CI understands formula semantics.
