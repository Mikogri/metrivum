# Coaching UI

`apps/web/app/modules/coaching` implements the coach and client screens on the shared authenticated app shell. It uses generated API schemas, the account-scoped HTTP transport and TanStack Query; business authorization and monetary calculations stay in the API.

| Area | Main routes | Behavior |
| --- | --- | --- |
| Relationships | `/app/clients`, `/app/groups`, `/app/my-coaches` | Paged lists, group membership, explicit relationship status changes and history. |
| Forms | `/app/forms`, `/app/forms/new`, `/app/forms/:formId` | Application/check-in builder, typed questions, preview, publish, duplicate and archive. |
| Offers | `/app/offers`, `/app/coaches/:coachId/offers` | Billing-option editor and authenticated client browsing/application entry. Only a never-published draft can be deleted (`DELETE /api/v1/offers/{id}`); published offers keep immutable terms and are archived instead (409 `OFFER_PUBLISHED`). `hasClientHistory` explains why archiving is the only option once clients have used an offer. |
| Intake | `/app/leads`, `/app/my-applications`, `/app/invitations`, `/app/my-invitations` | Private drafts, explicit submission, frozen terms, acceptance/rejection and in-app invitations. |
| Services | `/app/clients/:relationshipId/services`, `/app/my-coaches/:relationshipId/services`, `/app/services/:serviceId` | Accepted terms and independent service completion; coach billing history. |
| Check-ins | `/app/check-ins`, `/app/my-check-ins`, `/app/check-in-schedules` | Recipient selection, recurrence/timezone, typed answers, late status, review and private coach notes. |
| Billing | `/app/payments`, `/app/earnings`, `/app/coaching-preferences` | Simulated methods/payment retries, external receipts, currency-separated totals and account currency. |

Navigation follows server-owned account roles. Feature checks and returned `allowedActions` control writes. API errors remain visible; failed requests never fall back to mock data. New offers default to **No application form**, even when a published form is available. Clients still submit explicitly and accept Team scope where required; coaches still accept or decline. Pricing explicitly selects **Free** or **Paid** per option, preserving session, package and validity rules. Other flows select a sole valid prerequisite automatically and explain missing prerequisites.

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

Training-plan offers select one-time pricing and an applied source revision when accepting an application. Pending purchases show price/payment status only. Clients use **Training plans** (All / Assigned / Purchased); successful payment reveals their independent editable copy. Autosave remains a draft, and **Apply changes** updates the effective revision. The old manual assignment-refresh menu is removed.

## Plan descriptions and sheet rendering

Plan/template detail descriptions clamp to two lines with ellipsis. Click, keyboard activation or right-click opens the full selectable text in the existing context-menu surface; Escape/outside dismissal and mobile presentation remain owned by ui-web.

Sheets skip animation frames for unchanged effective column widths, reuse column offsets for a width snapshot, reuse per-render card bounds and group connection targets in one pass. Cable animation retains its existing duration but unchanged coordinates keep the same React state instead of rerendering all expanded cards. These are render-work reductions, not a measured large-plan latency claim. Focused geometry, animation and description tests verify parity and the no-op frame path; interactive profiling on a representative expanded plan remains necessary.

Further sheet isolation: scroll position/viewport framing now lives inside SheetMinimap, while SheetCanvas observes only actual viewport-size changes. Scroll events are coalesced into one pending animation frame; identical frames reuse state, and listeners/frames are cancelled on unmount. A regression test verifies that a scroll burst updates the zoom-adjusted minimap rectangle without rerendering the parent. Block ownership and effective formula scopes are indexed once per immutable document instead of repeatedly scanning/rebuilding them for every card on pointer updates. No event callbacks are omitted from memo comparisons, so editing actions keep current document state.

Verification of further isolation: 83 focused editor/model tests, typecheck and focused lint passed. Desktop program-detail preview passed. A legacy browser test still expects the removed cycle-level “Expand into cells” control and cannot exercise resize on the current standalone-workout layout; its fixture now returns the correct AI-connections array for the app bar. This is not evidence of a current resize failure; pointer/keyboard resize and cancellation remain covered by SheetCanvas component tests.
