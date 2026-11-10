import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

/** Public marketing pages: the same modules serve English (/) and Polish (/pl). */
function publicPages(locale: "en" | "pl") {
  const id = (name: string) => `${name}-${locale}`;
  return [
    index("modules/marketing/routes/home.tsx", { id: id("home") }),
    route("features", "modules/marketing/routes/features.tsx", {
      id: id("features"),
    }),
    route(
      "features/program-builder",
      "modules/marketing/routes/program-builder.tsx",
      { id: id("program-builder") },
    ),
    route(
      "features/video-analysis",
      "modules/marketing/routes/video-analysis.tsx",
      { id: id("video-analysis") },
    ),
    route("terms", "modules/marketing/routes/legal.tsx", { id: id("terms") }),
    route("privacy", "modules/marketing/routes/legal.tsx", {
      id: id("privacy"),
    }),
  ];
}

export default [
  layout("layouts/public-layout.tsx", { id: "public-en" }, publicPages("en")),
  route(
    "pl",
    "layouts/public-layout.tsx",
    { id: "public-pl" },
    publicPages("pl"),
  ),

  // Everything below needs the browser session layer; it never runs during pre-rendering.
  layout("layouts/private-root.tsx", [
    layout("layouts/auth-layout.tsx", [
      route("auth/login", "modules/auth/routes/login.tsx"),
      route("auth/register", "modules/auth/routes/register.tsx"),
      route("auth/verify", "modules/auth/routes/verify.tsx"),
      route("auth/forgot-password", "modules/auth/routes/forgot-password.tsx"),
      route("auth/reset-password", "modules/auth/routes/reset-password.tsx"),
      route("auth/callback", "modules/auth/routes/callback.tsx"),
      route("auth/mfa", "modules/auth/routes/mfa.tsx"),
      route("onboarding", "modules/accounts/routes/onboarding.tsx"),
      route("onboarding/plan", "modules/subscription/routes/choose-plan.tsx"),
      // An assistant's OAuth request: the address stays under /app (it is registered with the auth server).
      layout("modules/integrations/consent-gate.tsx", [
        route("app/integrations/consent", "modules/integrations/consent.tsx"),
      ]),
    ]),
    route("app", "layouts/app-layout.tsx", [
      index("modules/dashboard/routes/app-index.tsx"),
      route("today", "modules/dashboard/routes/today.tsx"),
      route("more", "modules/dashboard/routes/more.tsx"),
      route("analysis", "modules/video-analysis/routes/mobile-analysis.tsx"),
      route("messages", "modules/messaging/messages.tsx"),
      route("calendar", "modules/calendar/routes/calendar.tsx"),
      route("dashboard", "modules/dashboard/routes/dashboard.tsx"),
      route("clients", "modules/coaching/routes/clients.tsx"),
      route(
        "clients/:relationshipId",
        "modules/coaching/routes/relationship.tsx",
      ),
      route("groups", "modules/coaching/routes/groups.tsx"),
      route("groups/:groupId", "modules/coaching/routes/group.tsx"),
      route("my-coaches", "modules/coaching/routes/my-coaches.tsx"),
      route("discover", "modules/coaching/routes/discover.tsx"),
      // Temporary: specialization picker preview (development builds only).
      route(
        "dev/specializations",
        "modules/coaching/routes/dev-specializations.tsx",
      ),
      route("forms", "modules/coaching/routes/forms.tsx"),
      route("forms/new", "modules/coaching/routes/form-detail.tsx", {
        id: "new-form",
      }),
      route("forms/:formId", "modules/coaching/routes/form-detail.tsx"),
      route("offers", "modules/coaching/routes/offers.tsx"),
      route("offers/new", "modules/coaching/routes/offer-detail.tsx", {
        id: "new-offer",
      }),
      route("offers/:offerId", "modules/coaching/routes/offer-detail.tsx"),
      route(
        "coaches/:coachId/offers/:offerId",
        "modules/coaching/routes/offer-public.tsx",
      ),
      route(
        "coaches/:coachId/offers",
        "modules/coaching/routes/coach-offers.tsx",
      ),
      route("leads", "modules/coaching/routes/applications.tsx", {
        id: "leads",
      }),
      route("my-applications", "modules/coaching/routes/applications.tsx", {
        id: "my-applications",
      }),
      route(
        "applications/:applicationId",
        "modules/coaching/routes/application.tsx",
      ),
      route("invitations", "modules/coaching/routes/invitations.tsx", {
        id: "sent-invitations",
      }),
      route("my-invitations", "modules/coaching/routes/invitations.tsx", {
        id: "my-invitations",
      }),
      route(
        "invitations/:invitationId",
        "modules/coaching/routes/invitation.tsx",
      ),
      route(
        "clients/:relationshipId/services",
        "modules/coaching/routes/services.tsx",
        { id: "client-services" },
      ),
      route(
        "my-coaches/:relationshipId/services",
        "modules/coaching/routes/services.tsx",
        { id: "my-services" },
      ),
      route("services/:serviceId", "modules/coaching/routes/service.tsx"),
      route("check-ins", "modules/coaching/routes/check-ins.tsx", {
        id: "coach-check-ins",
      }),
      route("my-check-ins", "modules/coaching/routes/check-ins.tsx", {
        id: "client-check-ins",
      }),
      route("check-ins/:requestId", "modules/coaching/routes/check-in.tsx"),
      route("check-in-schedules", "modules/coaching/routes/schedules.tsx"),
      route("check-in-schedules/new", "modules/coaching/routes/schedule.tsx", {
        id: "new-schedule",
      }),
      route(
        "check-in-schedules/:scheduleId",
        "modules/coaching/routes/schedule.tsx",
      ),
      route("transactions", "modules/coaching/routes/transactions.tsx"),
      route("payments", "modules/coaching/routes/payments.tsx"),
      route("team", "modules/team/team.tsx"),
      route("subscription", "modules/subscription/routes/subscription.tsx"),
      route("checkout", "modules/subscription/routes/checkout.tsx"),
      route("usage", "modules/usage/routes/usage.tsx"),
      route("analyze", "modules/analyze/analyze-page.tsx"),
      route("earnings", "modules/coaching/routes/earnings.tsx"),
      route("coaching-preferences", "modules/coaching/routes/preferences.tsx"),
      // Temporary: every toast variant on one page while the design is tuned. Remove with the nav entry.
      route("exercises", "modules/exercises/routes/exercises.tsx"),
      route("anatomy", "modules/anatomy/redirect.tsx"),
      route(
        "exercises/:exerciseId",
        "modules/exercises/routes/exercise-detail.tsx",
      ),
      route("programs", "modules/training/routes/programs.tsx"),
      route(
        "programs/generate",
        "modules/training/generator/GeneratorScreen.tsx",
      ),
      route("training-plans", "modules/training/purchases/TrainingPlans.tsx"),
      route(
        "training-plans/:programId",
        "modules/training/purchases/PurchasedPlan.tsx",
        { id: "purchased-plan" },
      ),
      route(
        "training-plans/:programId/edit",
        "modules/training/purchases/PurchasedPlan.tsx",
        { id: "purchased-plan-editor" },
      ),
      route(
        "my-training/plans/:assignmentId",
        "modules/training/delivery/AssignedPlan.tsx",
      ),
      route("my-training", "modules/training/delivery/TrainingHome.tsx"),
      route(
        "my-training/workouts/:occurrenceId",
        "modules/training/delivery/WorkoutLog.tsx",
        { id: "client-workout" },
      ),
      route("my-analyses", "modules/video-analysis/routes/coach-analyses.tsx"),
      route(
        "my-analyses/:analysisId",
        "modules/video-analysis/routes/coach-analysis.tsx",
      ),
      route(
        "training/workouts/:occurrenceId",
        "modules/training/delivery/WorkoutLog.tsx",
        { id: "coach-workout" },
      ),
      route(
        "my-documents",
        "modules/client-documentation/client-documents.tsx",
      ),
      route(
        "my-coaches/:relationshipId/documents",
        "modules/client-documentation/client-documents.tsx",
        { id: "relationship-documents" },
      ),
      route(
        "programs/:programId",
        "modules/training/routes/program-detail.tsx",
      ),
      route("templates", "modules/training/routes/templates.tsx"),
      route("formulas", "modules/training/routes/formulas.tsx"),
      route("video-analyses", "modules/video-analysis/routes/analyses.tsx"),
      route(
        "video-analyses/new",
        "modules/video-analysis/routes/new-analysis.tsx",
      ),
      route(
        "video-analyses/compare",
        "modules/video-analysis/routes/compare.tsx",
      ),
      route(
        "video-analyses/shared/:token",
        "modules/video-analysis/routes/shared-analysis.tsx",
      ),
      route(
        "video-analyses/:analysisId",
        "modules/video-analysis/routes/analysis-detail.tsx",
      ),
      route("settings", "modules/settings/routes/settings.tsx"),
      // Sign-in and security: each change has its own page; the overview stays in settings.
      route(
        "settings/security/change-email",
        "modules/settings/routes/security/change-email.tsx",
      ),
      route(
        "settings/security/change-password",
        "modules/settings/routes/security/change-password.tsx",
      ),
      route(
        "settings/security/two-factor",
        "modules/settings/routes/security/two-factor.tsx",
      ),
      route(
        "settings/security/recovery",
        "modules/settings/routes/security/recovery.tsx",
      ),
      route("profile", "modules/people/routes/profile.tsx", {
        id: "my-profile",
      }),
      route("people/:username", "modules/people/routes/profile.tsx", {
        id: "person-profile",
      }),
      route(
        "integrations/actions/:actionId",
        "modules/integrations/action-approval.tsx",
      ),
      // The editor fills the content area (route handle `workspace`), keeping the sidebar and app bar.
      route(
        "programs/:programId/edit",
        "modules/training/routes/program-editor.tsx",
        { id: "program-editor" },
      ),
      route(
        "templates/:templateId/edit",
        "modules/training/routes/program-editor.tsx",
        { id: "template-editor" },
      ),
    ]),
  ]),

  route("sitemap.xml", "modules/marketing/routes/sitemap.ts"),
  route("*", "modules/marketing/routes/not-found.tsx"),
] satisfies RouteConfig;
