import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const owner = "00000000-0000-4000-8000-000000000000";
const dueId = "40000000-0000-4000-8000-000000000001";
const now = "2026-10-08T09:00:00Z";
const catalog = JSON.parse(
  readFileSync(
    new URL("../../../contracts/generated/features.json", import.meta.url),
    "utf8",
  ),
) as { key: string }[];

test("responsive checkout preserves quote review and payment at narrow widths", async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto("/app/subscription");
  await page.getByRole("button", { name: "Pay for Team", exact: true }).click();
  const checkout = page.getByRole("region", { name: "Team checkout" });
  await checkout
    .getByLabel("Team name", { exact: true })
    .fill("Metrivum Test Team");
  await checkout.getByLabel("Purchased seats", { exact: true }).fill("3");
  await checkout
    .getByRole("button", { name: "Review quote", exact: true })
    .click();
  await expect(checkout.getByText(/Amount due:.*209[.,]69/)).toBeVisible();
  const confirm = checkout.getByRole("button", {
    name: "Confirm payment",
    exact: true,
  });
  await confirm.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    )
    .toBeTruthy();
  const button = await confirm.boundingBox();
  expect(button!.x).toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.screenshot({
    path: testInfo.outputPath("team-checkout.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(state.settlements()).toBe(0);
  await confirm.click();
  await expect(page.getByRole("status")).toContainText("Team is active");
  expect(state.settlements()).toBe(1);
});

async function fixture(
  page: Page,
  configured = true,
  role = "Coach",
  teamRole: string | null = null,
  transferRequest = false,
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let settlements = 0;
  let accepted = teamRole != null;
  let dissolutionAt: string | null = null;
  let consentAccepted = false;
  let coachAssigned = false;
  let purchasedSeats = 3;
  let billingVersion = 1;
  const teamId = "70000000-0000-4000-8000-000000000001";
  const quote = {
    id: dueId,
    teamId,
    teamName: "Metrivum Test Team",
    kind: "Initial",
    status: "Quoted",
    purchasedSeats: 3,
    unitPrice: 78.23,
    grossAmount: 234.69,
    creditAmount: 25,
    amountDue: 209.69,
    currency: "PLN",
    priceVersion: "team-e2e-v1",
    termsVersion: "v1",
    createdAt: now,
    expiresAt: "2099-10-08T10:00:00Z",
    dueId: null,
    confirmedAt: null,
  };
  const billing = () => ({
    teamId,
    status: "Active",
    purchasedSeats,
    occupiedSeats: 1,
    pendingSeats: null,
    periodStart: now,
    periodEnd: "2026-11-08T09:00:00Z",
    autoRenew: false,
    version: billingVersion,
    unitPrice: 78.23,
    currency: "PLN",
    renewalMethodEligible: false,
    history: [],
  });
  const subscription = {
    id: owner,
    planId: "Free",
    status: "Active",
    periodStart: null as string | null,
    periodEnd: null as string | null,
    nextDueAt: null as string | null,
    autoRenew: false,
    pendingPlanId: null as string | null,
    version: 1,
    pendingDue: null as {
      id: string;
      amount: number;
      currency: string;
      status: string;
      dueAt: string;
      periodEnd: string;
    } | null,
    acceptedPriceVersion: null as string | null,
    acceptedTermsVersion: null as string | null,
  };
  const payments: {
    id: string;
    grossAmount: number;
    currency: string;
    source: string;
    settledAt: string;
  }[] = [];
  await page.addInitScript((id) => {
    localStorage.setItem(
      "tf.auth.slot.0",
      JSON.stringify({
        access_token: "mock-0",
        refresh_token: "mock-refresh-0",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id,
          email: "coach@trainflow.test",
          aud: "authenticated",
        },
      }),
    );
    localStorage.setItem("tf.auth.active-slot", "0");
  }, owner);
  await page.route("**/shared/dev/mockApi.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const mockFetch = (input, init) => fetch(input, init);",
    }),
  );
  await page.route("http://mock.trainflow.invalid/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (data: unknown) =>
      route.fulfill({
        json: data,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
    if (request.method() === "OPTIONS") return respond(null);
    if (request.method() !== "GET") {
      const body = request.postDataJSON() ?? {};
      writes.push({ path, body });
      if (path.endsWith("/decision")) {
        accepted = Boolean(body.accept);
        teamRole = "Member";
        return respond({});
      }
      if (path.endsWith("/checkout-quote")) {
        quote.purchasedSeats = Number(body.purchasedSeats);
        quote.teamName = String(body.teamName);
        return respond(quote);
      }
      if (path.endsWith("/confirm-purchase")) {
        settlements++;
        accepted = true;
        teamRole = "Owner";
        return respond(billing());
      }
      if (path.endsWith("/seats/quote")) {
        Object.assign(quote, {
          kind: "Seats",
          purchasedSeats: Number(body.purchasedSeats),
          creditAmount: 0,
          grossAmount: 78.23,
          amountDue: 78.23,
        });
        return respond(quote);
      }
      if (path.endsWith("/seats/confirm")) {
        purchasedSeats = quote.purchasedSeats;
        billingVersion++;
        settlements++;
        return respond(billing());
      }
      if (path.endsWith("/schedule-dissolution")) {
        dissolutionAt = "2026-11-08T09:00:00Z";
        return respond({});
      }
      if (path.endsWith("/cancel-dissolution")) {
        dissolutionAt = null;
        return respond({});
      }
      if (path.endsWith("/team-client-transfer-requests/transfer-1/accept")) {
        consentAccepted = true;
        return respond({});
      }
      if (path.endsWith("/assign-coach")) {
        coachAssigned = true;
        return respond({});
      }
      if (path.endsWith("/change-plan")) {
        if (subscription.planId === "Pro") subscription.pendingPlanId = "Free";
        else subscription.planId = "Free";
        subscription.autoRenew = false;
        subscription.version++;
        return respond(subscription);
      }
      if (path.endsWith("/checkout")) {
        subscription.pendingPlanId = body.planId;
        subscription.pendingDue = {
          id: dueId,
          amount: body.planId === "Team" ? 78.23 : 97.79,
          currency: "PLN",
          status: "AwaitingPayment",
          dueAt: now,
          periodEnd: "2026-11-08T09:00:00Z",
        };
        subscription.status = "AwaitingPayment";
        subscription.acceptedPriceVersion = "e2e-v1";
        subscription.acceptedTermsVersion = "v1";
        subscription.version++;
      }
      if (path.endsWith("/confirm-payment")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (subscription.planId !== subscription.pendingPlanId) {
          settlements++;
          payments.push({
            id: dueId,
            grossAmount: subscription.pendingDue!.amount,
            currency: "PLN",
            source: "Simulated",
            settledAt: now,
          });
        }
        subscription.planId = subscription.pendingPlanId!;
        subscription.pendingPlanId = null;
        subscription.status = "Active";
        subscription.pendingDue = null;
        subscription.periodStart = now;
        subscription.periodEnd = "2026-11-08T09:00:00Z";
        subscription.nextDueAt = subscription.periodEnd;
      }
      return respond(subscription);
    }
    if (path === "/api/v1/me")
      return respond({
        id: owner,
        workspaceId: owner,
        username: "subscription_coach",
        displayName: "Subscription Coach",
        birthDate: "1990-01-01",
        locale: "en",
        timeZone: "Europe/Warsaw",
        onboarded: true,
        version: 1,
        roles: [role],
        contexts: [role],
      });
    if (path === "/api/v1/me/access")
      return respond({
        version: "test",
        features: catalog.map(({ key }) => ({
          key,
          available: true,
          reason: "available",
        })),
        limits: [],
      });
    if (path === "/api/v1/me/profile-fields")
      return respond({ currency: "PLN", values: {}, version: 1 });
    if (path === "/api/v1/subscriptions/plans")
      return respond([
        {
          id: "Free",
          name: "Free",
          amount: 0,
          currency: "PLN",
          commissionRate: 0.1,
          priceConfigured: true,
          priceVersion: null,
          termsVersion: "v1",
          capabilities: ["messaging.direct", "analytics.view"],
        },
        {
          id: "Pro",
          name: "Pro",
          amount: configured ? 97.79 : null,
          currency: "PLN",
          commissionRate: 0.05,
          priceConfigured: configured,
          priceVersion: configured ? "e2e-v1" : null,
          termsVersion: "v1",
          capabilities: ["messaging.direct", "analytics.view"],
        },
        {
          id: "Team",
          name: "Team",
          amount: configured ? 78.23 : null,
          currency: "PLN",
          commissionRate: 0.05,
          priceConfigured: configured,
          priceVersion: "team-e2e-v1",
          termsVersion: "v1",
          capabilities: [],
        },
      ]);
    if (path === "/api/v1/teams/mine")
      return respond({
        teams: accepted
          ? [
              {
                id: teamId,
                name: "Strength Collective",
                description: "Coaching organization",
                isOwner: teamRole === "Owner",
                isMember: true,
                members: 1,
                role: teamRole,
                status: dissolutionAt ? "DissolutionScheduled" : "Active",
                version: 1,
                purchasedSeats: 3,
                occupiedSeats: 1,
                periodEnd: "2026-11-08T09:00:00Z",
                dissolutionAt,
                pendingOwnerId: null,
                allowedActions:
                  teamRole === "Owner"
                    ? [
                        "teams.manage",
                        "teams.invite",
                        "teams.clients",
                        "teams.analyze",
                        "teams.billing",
                        "teams.settings",
                        "teams.dissolve",
                        "teams.transfer-ownership",
                      ]
                    : teamRole === "Admin"
                      ? [
                          "teams.manage",
                          "teams.invite",
                          "teams.clients",
                          "teams.analyze",
                          "teams.settings",
                          "teams.leave",
                        ]
                      : ["teams.leave"],
              },
            ]
          : [],
        requests: [
          {
            id: "invitation-1",
            teamId,
            teamName: "Strength Collective",
            displayName: "Subscription Client",
            kind: "Invite",
            status: accepted ? "Accepted" : "Pending",
            canDecide: !accepted,
            role: "Member",
            expiresAt: "2099-10-08T10:00:00Z",
          },
        ],
      });
    if (path === `/api/v1/teams/${teamId}/members`)
      return respond([
        {
          userId: owner,
          displayName: "Subscription Coach",
          username: "subscription_coach",
          role: teamRole,
          joinedAt: now,
        },
      ]);
    if (path === `/api/v1/teams/${teamId}/billing`) return respond(billing());
    if (path === "/api/v1/me/team-client-transfer-requests")
      return respond(
        transferRequest
          ? [
              {
                id: "transfer-1",
                teamId,
                relationshipId: "relationship-1",
                clientId: owner,
                proposedBy: "coach-1",
                status: consentAccepted ? "Accepted" : "Pending",
                consentVersion: "v1",
                consentText:
                  "Transfer your coaching case to Strength Collective. Only new Team records are shared; private history stays private.",
                createdAt: now,
                expiresAt: "2099-10-08T10:00:00Z",
                version: 7,
                allowedActions: consentAccepted ? [] : ["accept", "decline"],
              },
            ]
          : [],
      );
    if (path === `/api/v1/teams/${teamId}/clients`)
      return respond([
        {
          id: "case-1",
          teamId,
          clientId: "client-1",
          clientName: "Team Client",
          status: "Active",
          createdAt: now,
          version: coachAssigned ? 2 : 1,
          assignedCoachIds: coachAssigned ? [owner] : [],
          allowedActions: teamRole === "Owner" ? ["assign-coach"] : [],
        },
      ]);
    if (path === "/api/v1/coaching/clients")
      return respond({ items: [], page: 1, pageSize: 20, total: 0 });
    if (path === "/api/v1/me/platform-subscription")
      return respond(subscription);
    if (path === "/api/v1/me/platform-subscription/history")
      return respond({ changes: [], payments });
    if (path === "/api/v1/me/notifications/unread-count")
      return respond({ count: 0 });
    if (path === "/api/v1/me/notifications")
      return respond({ items: [], page: 1, pageSize: 25, total: 0 });
    if (path === "/api/v1/me/notification-preferences")
      return respond({
        messaging: true,
        checkIns: true,
        coaching: true,
        billing: true,
        system: true,
      });
    return respond([]);
  });
  return { writes, settlements: () => settlements };
}

test("unconfigured price cannot be paid", async ({ page }) => {
  await fixture(page, false);
  await page.goto("/app/subscription");
  await expect(
    page.getByRole("heading", { name: "Subscription", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pay for Pro", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pay for Team", exact: true }),
  ).toBeDisabled();
});

test("Pro checkout survives reload and downgrade preserves the paid period", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/app/subscription");
  await page.getByRole("button", { name: "Pay for Pro", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pro checkout", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page.getByRole("button", { name: /Pay.*97[.,]79/ }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) })
      .getByRole("button", { name: "Your plan", exact: true }),
  ).toBeVisible();
  expect(state.settlements()).toBe(1);
  expect(
    state.writes.find((w) => w.path.endsWith("/checkout"))?.body,
  ).toMatchObject({ planId: "Pro", priceVersion: "e2e-v1" });
  await page.reload();
  await expect(
    page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) })
      .getByRole("button", { name: "Your plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Platform payment history" }),
  ).toContainText("Simulated");
  await page
    .getByRole("button", { name: "Switch to Free at period end", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Pro", exact: true }) })
      .getByRole("button", { name: "Your plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Free starts at the end of your paid period/),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    )
    .toBeTruthy();
});

test("coach reviews seat quote and Pro credit before confirming simulated Team payment", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/app/team");
  await expect(
    page.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Subscription", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Plans" });
  await panel
    .getByRole("button", { name: "Pay for Team", exact: true })
    .click();
  await panel
    .getByLabel("Team name", { exact: true })
    .fill("Metrivum Test Team");
  await panel.getByLabel("Purchased seats", { exact: true }).fill("3");
  await panel
    .getByRole("button", { name: "Review quote", exact: true })
    .click();
  await expect(panel.getByText(/Unused Pro credit:.*25/)).toBeVisible();
  await expect(panel.getByText(/Amount due:.*209[.,]69/)).toBeVisible();
  await panel
    .getByRole("button", { name: "Confirm payment", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `../../.local/stage06/team-quote-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(state.settlements()).toBe(0);
  expect(
    state.writes.find((w) => w.path.endsWith("/checkout-quote"))?.body,
  ).toMatchObject({
    teamName: "Metrivum Test Team",
    purchasedSeats: 3,
    priceVersion: "team-e2e-v1",
  });
  await panel
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Team is active");
  expect(
    state.writes.find((w) => w.path.endsWith("/confirm-purchase"))?.body,
  ).toMatchObject({ quoteId: dueId });
  expect(state.settlements()).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
    )
    .toBeTruthy();
});

test("Free client sees invitation-only Team entry and can accept an invitation", async ({
  page,
}) => {
  const state = await fixture(page, true, "Client");
  await page.goto("/app/team");
  await expect(
    page.getByRole("heading", { name: "Team", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Request to join", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Find a team", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Strength Collective", exact: true }),
  ).toBeVisible();
  expect(state.writes.some((w) => w.path.endsWith("/checkout"))).toBe(false);
  await expect(
    page.getByRole("tab", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Assigned clients", exact: true }),
  ).toBeVisible();
});

test("Admin has management and Analyze but cannot see owner billing", async ({
  page,
}) => {
  await fixture(page, true, "Coach", "Admin");
  await page.goto("/app/team");
  await expect(
    page.getByRole("link", { name: "Team Analyze", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Invite by username", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transfer ownership", exact: true }),
  ).toHaveCount(0);
});

test("Owner sees full dissolution consequences and can cancel without resuming renewal", async ({
  page,
}) => {
  const state = await fixture(page, true, "Coach", "Owner");
  await page.goto("/app/team");
  await page.getByRole("tab", { name: "Billing", exact: true }).click();
  await page
    .getByRole("button", { name: "Schedule Team dissolution", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Dissolve Strength Collective?",
  });
  await expect(
    confirmation.getByText(
      /private clients and personal resources stay unchanged/,
    ),
  ).toBeVisible();
  await expect(
    confirmation.getByText(/not automatically converted/),
  ).toBeVisible();
  await expect(
    confirmation.getByText(/no automatic partial refund/),
  ).toBeVisible();
  await expect(
    confirmation.getByRole("button", {
      name: "Confirm scheduled dissolution",
      exact: true,
    }),
  ).toBeInViewport();
  await page.screenshot({
    path: `../../.local/stage06/team-dissolution-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    state.writes.some((write) => write.path.endsWith("/schedule-dissolution")),
  ).toBe(false);
  await confirmation
    .getByRole("button", { name: "Confirm scheduled dissolution", exact: true })
    .click();
  await expect(
    page.getByText("Team dissolution scheduled", { exact: true }),
  ).toBeVisible();
  expect(
    state.writes.find((write) => write.path.endsWith("/schedule-dissolution"))
      ?.body,
  ).toMatchObject({ version: 1, confirmed: true });
  await page
    .getByRole("button", { name: "Cancel scheduled dissolution", exact: true })
    .click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path.endsWith("/cancel-dissolution"))
          ?.body,
    )
    .toMatchObject({ version: 1, resumeRenewal: false });
});

test("client reviews exact transfer consent before acceptance", async ({
  page,
}) => {
  const state = await fixture(page, true, "Client", null, true);
  await page.goto("/app/team");
  await page
    .getByRole("button", { name: "Review and accept transfer", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Accept transfer to Team?",
  });
  await expect(
    confirmation.getByText(/Only new Team records are shared/),
  ).toBeVisible();
  expect(state.writes.some((write) => write.path.endsWith("/accept"))).toBe(
    false,
  );
  await confirmation
    .getByRole("button", { name: "Accept transfer", exact: true })
    .click();
  await expect
    .poll(
      () =>
        state.writes.find((write) =>
          write.path.endsWith(
            "/team-client-transfer-requests/transfer-1/accept",
          ),
        )?.body,
    )
    .toMatchObject({ version: 7 });
  await expect(
    page.getByRole("button", {
      name: "Review and accept transfer",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("owner assigns Team client using the case version", async ({ page }) => {
  const state = await fixture(page, true, "Coach", "Owner");
  await page.goto("/app/team");
  await page.getByRole("tab", { name: "Team clients", exact: true }).click();
  await page
    .getByRole("button", { name: /Assign coach to Team Client/ })
    .click();
  await page
    .getByRole("option", { name: "Subscription Coach", exact: true })
    .click();
  await page.getByRole("button", { name: "Assign coach", exact: true }).click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path.endsWith("/assign-coach"))
          ?.body,
    )
    .toMatchObject({ coachId: owner, version: 1 });
  await expect(
    page.getByRole("table", { name: "Team clients", exact: true }),
  ).toContainText("Subscription Coach");
});

test("seat capacity changes only after the owner confirms the reviewed adjustment", async ({
  page,
}) => {
  const state = await fixture(page, true, "Coach", "Owner");
  await page.goto("/app/team");
  await page.getByRole("tab", { name: "Billing", exact: true }).click();
  await page.getByLabel("Paid seats", { exact: true }).fill("4");
  await page
    .getByRole("button", { name: "Review seat adjustment", exact: true })
    .click();
  await expect(page.getByText(/Amount due:.*78[.,]23/)).toBeVisible();
  await expect(
    page.getByText("1 occupied / 3 paid seats · Active", { exact: true }),
  ).toBeVisible();
  expect(state.settlements()).toBe(0);
  expect(
    state.writes.find((write) => write.path.endsWith("/seats/quote"))?.body,
  ).toMatchObject({ purchasedSeats: 4, version: 1 });
  await page
    .getByRole("button", { name: "Confirm payment", exact: true })
    .click();
  await expect(
    page.getByText("1 occupied / 4 paid seats · Active", { exact: true }),
  ).toBeVisible();
  expect(state.settlements()).toBe(1);
});
