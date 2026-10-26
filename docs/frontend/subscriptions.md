# Subscription and quota UI

Public pricing reads the anonymous `/api/v1/subscriptions/catalog`; signed-in plan selection reads the same canonical catalog through `/subscriptions/plans`. Prices, currency, capabilities and limits come from the API. Only monthly plans are offered. Pro is labelled Recommended, without a popularity claim.

Checkout always asks for explicit simulated confirmation and reuses an idempotency key when confirmation is retried. Upgrades begin a new monthly period without proration; lower plans are scheduled for period end. Team and Studio quote the whole workspace with its included seats. The UI offers no extra paid seats. Subscription settings show dates, renewal, upcoming changes, server usage/reset dates, simulated payments and refunds. Platform subscription charges and service commissions are presented separately.

The generator and local analysis explicitly default to the personal quota. An active team can be selected through the account-scoped quota selector; membership alone never chooses a shared budget. `/api/v1/me/usage?teamId=…` supplies the selected scope's plan and counters. API membership, role and resource checks remain authoritative.

Local analysis reserves a permit online before enqueueing work or retrying a failed companion job. The account-scoped browser mapping keeps the companion job ID, permit ID and selected team. Failed enqueueing and known failed/removed jobs release their reservation; successful synchronization supplies the permit and consumes it once. Save retries preserve the result ID and uploaded media. Account changes stop the operation; abandoned permits expire server-side. Browser storage and an uncontrolled offline companion cannot prove the number of offline runs. This workflow enforces online admission and synchronization, not cryptographic offline execution limits.

Cloud analysis is shown separately as unavailable until trusted GPU execution and metering are configured. The UI produces no synthetic analysis results. `feature_not_in_plan` displays a contextual upgrade link; role denials retain their own explanation.
