# Coaching UI

`apps/web/app/modules/coaching` implements the coach and client screens on the shared authenticated app shell. It uses generated API schemas, the account-scoped HTTP transport and TanStack Query; business authorization and monetary calculations stay in the API.

| Area | Main routes | Behavior |
| --- | --- | --- |
| Relationships | `/app/clients`, `/app/groups`, `/app/my-coaches` | Paged lists, group membership, explicit relationship status changes and history. |
| Forms | `/app/forms`, `/app/forms/new`, `/app/forms/:formId` | Application/check-in builder, typed questions, preview, publish, duplicate and archive. |
| Offers | `/app/offers`, `/app/coaches/:coachId/offers` | Billing-option editor and authenticated client browsing/application entry. |
| Intake | `/app/leads`, `/app/my-applications`, `/app/invitations`, `/app/my-invitations` | Private drafts, explicit submission, frozen terms, acceptance/rejection and in-app invitations. |
| Services | `/app/clients/:relationshipId/services`, `/app/my-coaches/:relationshipId/services`, `/app/services/:serviceId` | Accepted terms and independent service completion; coach billing history. |
| Check-ins | `/app/check-ins`, `/app/my-check-ins`, `/app/check-in-schedules` | Recipient selection, recurrence/timezone, typed answers, late status, review and private coach notes. |
| Billing | `/app/payments`, `/app/earnings`, `/app/coaching-preferences` | Simulated methods/payment retries, external receipts, currency-separated totals and account currency. |

Navigation follows server-owned account roles. Feature checks and returned `allowedActions` control writes. API errors remain visible; failed requests never fall back to mock data. A sole valid form/payment method is selected automatically, and missing prerequisites explain the next action.

Editors protect browser unload, in-app navigation and account switching. Clean editors refresh when server versions change; dirty inputs stay local until saved or explicitly discarded. A 412 offers reload with confirmation. Form choice values preserve booleans/zero/numbers and stable keys. Equipment keys use readable shared names with underscores; weekday profile fields use ISO 1–7, while schedule recurrence uses Sunday=0.

The production build uses real Supabase sessions and the API. Browser tests run a separate development server with explicit mock Auth and intercepted HTTP responses; these verify UI behavior, not live Auth or cloud workflows. Real domain workflows are covered by PostgreSQL integration tests and the restricted-role development fixture console.

```powershell
npm run typecheck
npm test
npm run build
cd apps/web
npx playwright test --config playwright.coaching.config.ts
```

See [stage 02](../coaching/stage-02.md) for domain rules and [verification](../coaching/stage-02-verification.md) for deployment evidence.

## Coach and Client workspaces

Navigation now follows the account-scoped workspace mode. Coach has one Clients entry with internal Clients/Leads/Invitations/Groups/Check-ins navigation. Calendar replaces Schedules in the sidebar and is available in both modes. Existing links into the other workspace offer a switch with destination preservation. See [calendar behavior and contracts](../coaching/calendar.md).
`HubNavigation`, rendered immediately below each page header, uses the shared underline Tabs from Video analyses for Clients and Programs/Templates. Route changes preserve deep links and draft guards; the parent sidebar entry stays selected. The compact sidebar workspace dropdown switches the entire Coach/Client context.
