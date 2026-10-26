# Analytics and plan access

`analytics.view` grants Basic Analyze to coaches on every plan. `GET /api/v1/analyze/basic` returns current client status counts, recorded payment totals and a simple series, basic check-ins and message counts. The public DTO excludes retention, acquisition/conversion, period comparisons, MRR, recurring-subscription metrics and offer revenue breakdowns. Payment results explicitly identify the platform's simulated transactions; external recorded payments stay separate.

`analytics.advanced` additionally protects overview, context/comparison metadata, financial breakdowns, client retention, acquisition and aggregate training reports. Guards run inside `AnalysisService`, including calls from MCP. Direct per-client training progress remains in Training with its original authorization. Basic check-in and message section reads remain available on every plan.

MCP financial reads preserve basic totals and series on Free/Starter. Premium-only fields are null, `advanced` is false, and offer breakdowns are null. Pro+ retains those values. Null means unavailable under this plan; zero remains a real measured zero.

The web Analyze route chooses Basic or Advanced from the current access snapshot. CoachPulse uses the same distinction and drops paid report placeholders on a plan change. Neither UI decides backend authorization. Existing record, group, personal/team and member scope checks still apply.
