import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const me = "00000000-0000-4000-8000-000000000000";
const group = "10000000-0000-4000-8000-000000000001";
const offer = "10000000-0000-4000-8000-000000000002";
const catalog = JSON.parse(
  readFileSync(
    new URL("../../../contracts/generated/features.json", import.meta.url),
    "utf8",
  ),
) as { key: string }[];
const finance = {
  totals: [
    {
      currency: "EUR",
      gross: 350,
      fee: 30,
      net: 320,
      pending: 80,
      payments: 3,
      payingClients: 1,
      averagePayment: 116.67,
      revenuePerPayingClient: 350,
      mrr: 100,
      recurringSubscriptions: 1,
      renewals: 1,
      simulatedGross: 300,
      externalGross: 50,
    },
  ],
  series: [
    {
      date: "2026-10-08",
      currency: "EUR",
      gross: 350,
      fee: 30,
      net: 320,
      payments: 3,
    },
  ],
  offers: [
    {
      offerRevisionId: offer,
      name: "Coaching plan",
      currency: "EUR",
      gross: 350,
      net: 320,
      payments: 3,
      clients: 1,
    },
  ],
};
const clients = {
  active: 1,
  suspended: 0,
  completed: 0,
  newClients: 0,
  reactivated: 1,
  departed: 1,
  netGrowth: 0,
  retentionPercent: 100,
  series: [
    {
      date: "2026-10-08",
      active: 1,
      newClients: 0,
      reactivated: 1,
      departed: 1,
    },
  ],
  groups: [{ id: group, name: "Strength group", clients: 1 }],
};
const acquisition = {
  submitted: 2,
  accepted: 1,
  rejected: 1,
  conversionPercent: 50,
  invitationsSent: 2,
  invitationsAccepted: 1,
  invitationsDeclined: 1,
  sources: [
    {
      source: "Direct",
      submitted: 2,
      accepted: 1,
      rejected: 1,
      pending: 0,
      conversionPercent: 50,
    },
  ],
};
const checkIns = {
  issued: 3,
  submitted: 2,
  overdue: 1,
  pendingReview: 1,
  submissionRate: 66.67,
  averageReviewHours: 4,
  series: [{ date: "2026-10-08", issued: 3, submitted: 2, overdue: 1 }],
};
const currentCall = (calls: URL[]) =>
  [...calls]
    .reverse()
    .find((url) => /\/(context|overview)$/.test(url.pathname));
async function fixture(page: Page, teamRole: string | null = null) {
  const calls: URL[] = [];
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem(
        "tf.auth.slot.0",
        JSON.stringify({
          access_token: "mock-0",
          refresh_token: "mock-refresh-0",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id,
            email: "coach@trainflow.test",
            email_confirmed_at: "2026-01-01T00:00:00Z",
            aud: "authenticated",
          },
        }),
      );
      localStorage.setItem("tf.auth.active-slot", "0");
    },
    { id: me },
  );
  await page.route("**/shared/dev/mockApi.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const mockFetch = (input, init) => fetch(input, init);",
    }),
  );
  await page.route("http://mock.trainflow.invalid/**", async (route) => {
    const url = new URL(route.request().url());
    const respond = (data: unknown) =>
      route.fulfill({
        json: data,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    if (route.request().method() === "OPTIONS") return respond(null);
    if (
      url.pathname === "/api/v1/messaging/conversations" ||
      url.pathname === "/api/v1/messaging/requests" ||
      url.pathname === "/api/v1/messaging/blocks"
    )
      return respond([]);
    if (url.pathname === "/api/v1/me")
      return respond({
        id: me,
        workspaceId: me,
        username: "coach_test",
        displayName: "Test Coach",
        birthDate: "1990-01-01",
        locale: "en",
        timeZone: "Europe/Warsaw",
        onboarded: true,
        version: 1,
        roles: ["Coach"],
        contexts: ["Coach"],
      });
    if (url.pathname === "/api/v1/me/access")
      return respond({
        version: "fixture",
        features: [...catalog, { key: "analytics.view" }].map((f) => ({
          key: f.key,
          available: true,
          reason: "available",
        })),
        limits: [],
      });
    if (url.pathname === "/api/v1/me/notifications/unread-count")
      return respond({ count: 0 });
    if (url.pathname === "/api/v1/me/team-context")
      return respond(
        teamRole
          ? {
              teamId: group,
              ownerId: me,
              role: teamRole,
              status: "Active",
              isActive: true,
              name: "Strength Collective",
            }
          : null,
      );
    if (url.pathname === `/api/v1/teams/${group}/members`)
      return respond([
        {
          userId: me,
          displayName: "Test Coach",
          username: "coach_test",
          role: teamRole,
        },
        {
          userId: offer,
          displayName: "Another Coach",
          username: "another_coach",
          role: "Member",
        },
      ]);
    if (url.pathname.startsWith("/api/v1/analyze/")) {
      calls.push(url);
      const period = {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        timeZone: url.searchParams.get("timeZone"),
        start: "2026-10-01T00:00:00Z",
        end: "2026-10-09T00:00:00Z",
      };
      const overview = {
        period,
        comparisonPeriod: {
          ...period,
          from: "2026-09-23",
          to: "2026-09-30",
        },
        finance,
        previousFinance: { totals: [], series: [], offers: [] },
        clients,
        previousClients: { ...clients, active: 1 },
        acquisition,
        previousAcquisition: acquisition,
        checkIns,
        previousCheckIns: checkIns,
        messaging: { sent: 2, received: 3, conversations: 1 },
        training: {
          available: false,
          reason:
            "The program library has no session execution logs; scheduled sets are not completed training.",
        },
        filters: {
          groups: clients.groups,
          offers: [{ id: offer, name: "Coaching plan" }],
        },
      };
      const section = url.pathname.split("/").at(-1)!;
      return respond(
        (
          {
            financial: finance,
            clients,
            acquisition,
            "check-ins": checkIns,
            training: overview.training,
            messaging: overview.messaging,
            context: {
              period,
              comparisonPeriod: overview.comparisonPeriod,
              filters: overview.filters,
            },
          } as Record<string, unknown>
        )[section] ?? overview,
      );
    }
    return respond({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      count: 0,
    });
  });
  return calls;
}
test("Analyze legacy redirect, truthful finance, date/group/offer buckets and training empty state", async ({
  page,
  isMobile,
}) => {
  const calls = await fixture(page);
  await page.goto("/app/earnings");
  await expect(page).toHaveURL(/\/app\/analyze$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Analyze", exact: true }),
  ).toBeVisible();
  if (!isMobile)
    await expect(
      page
        .getByRole("button", { name: "Subscription", exact: true })
        .or(page.getByRole("link", { name: "Subscription", exact: true }))
        .first(),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New Program", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Finance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revenue by offer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated payments move no real money.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Custom", exact: true }).click();
  await expect(page.getByRole("group", { name: "From" })).toBeVisible();
  await page.getByRole("radio", { name: "7 days", exact: true }).click();
  await expect(page.getByRole("group", { name: "From" })).toHaveCount(0);
  const pick = async (label: string, option: string) => {
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  await pick("Client group", clients.groups[0]!.name);
  await pick("Offer", "Coaching plan");
  await pick("Trend buckets", "Weekly");
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("grouping"))
    .toBe("week");
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 6,
  );
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  expect(currentCall(calls)?.searchParams.get("from")).toBe(iso);
  expect(currentCall(calls)?.searchParams.get("groupId")).toBe(group);
  expect(currentCall(calls)?.searchParams.get("offerRevisionId")).toBe(offer);
  await page.getByRole("tab", { name: "Clients", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Applications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Groups overlap", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Check-ins", exact: true }).click();
  await expect(page.getByText("67%", { exact: true })).toBeVisible();
  await expect(
    page.getByText("4.0 h to review", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Training", exact: true }).click();
  await expect(
    page.getByText("No recorded training data", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    )
    .toBeTruthy();
  await page.screenshot({
    path: `../../.local/stage04/analyze-${test.info().project.name}.png`,
    fullPage: true,
  });
});

for (const [tab, heading, sections] of [
  ["finance", "Gross and net", ["context", "financial"]],
  ["clients", "Applications", ["context", "clients", "acquisition"]],
  ["checkins", "Requests per bucket", ["context", "check-ins", "messaging"]],
  ["training", "No recorded training data", ["context", "training"]],
] as const) {
  test(`Direct ${tab} tab requests only its sections and reuses a fresh result`, async ({
    page,
  }) => {
    const calls = await fixture(page);
    await page.goto(`/app/analyze?tab=${tab}`);
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
    expect(
      [...new Set(calls.map((url) => url.pathname.split("/").at(-1)))].sort(),
    ).toEqual([...sections].sort());
    const count = calls.length;
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible();
    expect(calls.length).toBe(count + 1);
    await page
      .getByRole("tab", {
        name:
          tab === "checkins"
            ? "Check-ins"
            : tab[0]!.toUpperCase() + tab.slice(1),
        exact: true,
      })
      .click();
    await expect(page.getByText(heading, { exact: true })).toBeVisible();
    expect(calls.length).toBe(count + 1);
  });
}

test("Owner defaults to Team and can inspect a member while URL dates and tab survive reload", async ({
  page,
}) => {
  const calls = await fixture(page, "Owner");
  await page.goto(
    "/app/analyze?from=2026-10-01&to=2026-10-07&tab=clients&grouping=week",
  );
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("scope"))
    .toBe("Team");
  await expect(
    page.getByRole("tab", { name: "Clients", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Analysis scope" }).click();
  await page.getByRole("option", { name: "Team member", exact: true }).click();
  await page.getByRole("button", { name: /Team member$/ }).click();
  await page
    .getByRole("option", { name: "Another Coach", exact: true })
    .click();
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("memberId"))
    .toBe(offer);
  expect(currentCall(calls)?.searchParams.get("scope")).toBe("TeamMember");
  await page.reload();
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("from"))
    .toBe("2026-10-01");
  await expect(
    page.getByRole("tab", { name: "Clients", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("memberId"))
    .toBe(offer);
  await page.getByRole("button", { name: "Analysis scope" }).click();
  await page.getByRole("option", { name: "Personal", exact: true }).click();
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("scope"))
    .toBe("Personal");
  expect(currentCall(calls)?.searchParams.has("memberId")).toBe(false);
  expect(currentCall(calls)?.searchParams.get("from")).toBe("2026-10-01");
});

test("Member defaults to Personal and can request only their own Team activity", async ({
  page,
}) => {
  const calls = await fixture(page, "Member");
  await page.goto("/app/analyze");
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("scope"))
    .toBe("Personal");
  await page.getByRole("button", { name: "Analysis scope" }).click();
  await expect(
    page.getByRole("option", { name: "Team", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "My Team activity", exact: true })
    .click();
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("scope"))
    .toBe("TeamMember");
  expect(currentCall(calls)?.searchParams.get("memberId")).toBe(me);
  await expect(
    page.getByRole("button", { name: "Team member", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/app/analyze?scope=TeamMember&memberId=${offer}`);
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("memberId"))
    .toBe(me);
  await page.goto("/app/analyze?scope=Team");
  await expect(
    page.getByText("Requested scope unavailable", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => currentCall(calls)?.searchParams.get("scope"))
    .toBe("Personal");
});

test("Analyze shows dashboard skeletons while the first overview request is pending", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/analyze/overview**", async (route) => {
    await pending;
    await route.fallback();
  });
  try {
    await page.goto("/app/analyze");
    await expect(
      page.getByRole("status", { name: "Loading analysis" }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("heading", { name: "Revenue", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading analysis" }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});
