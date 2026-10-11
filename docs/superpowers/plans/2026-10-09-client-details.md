# Client Details implementation plan

**Goal:** Implement the supplied six-tab Client Details specification using existing relationship-scoped domains.
**Spec:** C:/Users/Mikolaj/Downloads/trainflow_codex_client_details_spec.md
**Architecture:** Extend owning modules and their contracts; keep the relationship route a lazy composition of existing features. No duplicated domain stores, no public confidential media URLs, no subscription billing in client service history.

- [x] Training: paginated Activity filters/details and real execution-based Progress; assignments summary and server-derived statistics, including past-due denominator tests.
- [x] Documentation: existing typed measurements with edit/history/charts; photos, files and author-private notes; relationship/team authorization tests and additive migrations only if required.
- [x] Coaching/API: relationship-scoped overview, services/payment history, original applications and check-in filtered summaries; reuse contracts and immutable snapshots. Include cross-owner access tests.
- [x] Client Details UI: six tabs, scoped header and actions, overview cards, Profile, Check-ins and Payment History right drawers; responsive URL state and shared UI components.
- [x] Verification: regenerate OpenAPI/client types, run focused PostgreSQL integration/unit/browser tests, typecheck/lint/build and regression checks. Apply needed migrations only to verified DEV. Update concise English docs and report implemented/tested/migrations/deferred truthfully.

Preserve all pre-existing working-tree edits. Do not commit unrelated work. Missing values remain null or Not provided; never manufacture metrics. Independently owned tasks are delegated under subagent-driven-development, then integrated and reviewed.

Verification: backend unit 206 passed; broad integration 259 passed with seven worker startup failures subsequently fixed and covered in a 96-test passing regression run; two external Supabase prerequisites skipped. Client Details, Training and Documentation browser flows: 12 passed across desktop/mobile. Typecheck, ESLint and production build passed. Frontend unit suites: web 205 passed and UI primitives 12 passed (217 total). Three additive migrations applied and verified in DEV. Data-source limitations are recorded in docs/frontend/client-details.md.
