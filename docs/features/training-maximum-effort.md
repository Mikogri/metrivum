# Maximum-effort prescriptions and MCP compatibility

Training prescriptions support optional `workTimeMax: true` for maximum-effort duration. It cannot coexist with fixed WorkTime or a WorkTime field formula. AMRAP uses the existing Amrap set kind, without fixed repetitions or a Reps formula, and is a basic set marker.

A saved non-skipped maximum-effort set or segment permits workout completion without numerical results. Empty logs, skipped sets and unknown prescribed identifiers do not. Completion and Planned vs Actual share the performed-set rule; omitted repetitions and volume remain unknown.

MCP document contracts preserve output units, field formulas, timed block maxes, cycle repeats and implicit/inactive metadata. Additive optional properties keep existing clients compatible. Prescriptions are stored as JSON: no EF migration is required. Deploy the API before clients that send `workTimeMax`.

Verification covers strict domain/MCP JSON roundtrips, conflicting targets, segment identifiers, missing results and the save/complete flow on disposable local PostgreSQL.
