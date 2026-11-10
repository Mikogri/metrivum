import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const coach = "00000000-0000-4000-8000-000000000000";
const teamId = "70000000-0000-4000-8000-000000000001";
const offerId = "70000000-0000-4000-8000-000000000002";
const formId = "70000000-0000-4000-8000-000000000003";
const applicationId = "70000000-0000-4000-8000-000000000004";
const groupId = "70000000-0000-4000-8000-000000000005";
const relationshipId = "70000000-0000-4000-8000-000000000006";
const now = "2026-10-08T09:00:00Z";
const catalog = JSON.parse(
  readFileSync(
    new URL("../../../contracts/generated/features.json", import.meta.url),
    "utf8",
  ),
) as { key: string }[];

async function fixture(
  page: Page,
  client = false,
  noForm = false,
  publishedForms = true,
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const reads: URL[] = [];
  let groupCreated = false;
  let grouped = false;
  const group = {
    id: groupId,
    name: "Team cohort",
    description: "",
    color: "#10b981",
    archived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    teamId,
    allowedActions: ["edit", "archive", "add-member", "remove-member"],
  };
  const relationship = () => ({
    id: relationshipId,
    client: {
      id: applicationId,
      displayName: "Assigned Team client",
      username: "team_client",
    },
    status: "Active",
    startedAt: now,
    version: 1,
    updatedAt: now,
    groupIds: grouped ? [groupId] : [],
    statusHistory: [],
    allowedActions: [],
    teamId,
  });
  const offer = {
    id: offerId,
    coachId: coach,
    name: "Team coaching",
    description: "Organizational coaching",
    category: "strength",
    coachingMode: "Online",
    applicationFormVersionId: noForm ? null : formId,
    tags: [],
    billingOptions: [],
    status: "Draft",
    currentPublishedRevisionId: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    teamId,
    teamName: "Strength Collective",
  };
  const detail = {
    application: {
      id: applicationId,
      coachId: "other-coach",
      applicantUserId: coach,
      applicant: { id: coach, username: "client", displayName: "Test Client" },
      offerName: offer.name,
      offerRevisionId: offerId,
      billingOptionId: formId,
      selectedSessionCount: null,
      amount: noForm ? 0 : 100,
      currency: "PLN",
      status: "InProgress",
      source: "Direct",
      version: 1,
      allowedActions: ["submit"],
      relationshipId: null,
    },
    offerRevision: {
      ...offer,
      offerId,
      number: 1,
      currency: "PLN",
      publishedAt: now,
    },
    formVersion: noForm
      ? null
      : { id: formId, number: 1, definition: { sections: [] } },
    answers: {},
    profilePrefill: {},
    profileVersion: 1,
  };
  await page.addInitScript(
    ({ id, client }) => {
      localStorage.setItem(
        "tf.auth.slot.0",
        JSON.stringify({
          access_token: "mock-0",
          refresh_token: "mock-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id, email: "team@trainflow.test", aud: "authenticated" },
        }),
      );
      localStorage.setItem("tf.auth.active-slot", "0");
      localStorage.setItem(`tf.workspace.0:${id}`, client ? "client" : "coach");
    },
    { id: coach, client },
  );
  await page.route("**/shared/dev/mockApi.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const mockFetch = (input, init) => fetch(input, init);",
    }),
  );
  await page.route("http://mock.trainflow.invalid/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
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
      if (path === "/api/v1/offers" || path === `/api/v1/offers/${offerId}`) {
        Object.assign(offer, body, { version: offer.version + 1 });
        return respond(offer);
      }
      if (path === "/api/v1/coaching/groups") {
        groupCreated = true;
        Object.assign(group, body);
        return respond(group);
      }
      if (
        path === `/api/v1/coaching/groups/${groupId}/members/${relationshipId}`
      ) {
        grouped = true;
        group.version++;
        return respond(group);
      }
      if (path.endsWith("/assignments/preview"))
        return respond([
          {
            id: relationshipId,
            clientId: applicationId,
            displayName: "Assigned Team client",
            username: "team_client",
          },
        ]);
      if (path.endsWith("/submit")) {
        detail.application.status = "Submitted";
        detail.application.version++;
        return respond(detail);
      }
      return respond(detail);
    }
    reads.push(url);
    if (path === "/api/v1/me")
      return respond({
        id: coach,
        workspaceId: coach,
        username: "test_coach",
        displayName: "Test Coach",
        birthDate: "1990-01-01",
        locale: "en",
        timeZone: "Europe/Warsaw",
        onboarded: true,
        version: 1,
        roles: ["Coach", "Client"],
        contexts: ["Coach", "Client"],
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
    if (path === "/api/v1/me/team-context")
      return respond({
        teamId,
        ownerId: coach,
        role: "Owner",
        status: "Active",
        isActive: true,
        name: "Strength Collective",
      });
    if (path === "/api/v1/me/profile-fields")
      return respond({ currency: "PLN", values: {}, version: 1 });
    if (path === "/api/v1/offers/categories")
      return respond([{ key: "strength", name: "Strength" }]);
    if (path === "/api/v1/forms")
      return respond({
        items: publishedForms
          ? [
              {
                id: formId,
                name: "Application",
                currentPublishedVersionId: formId,
              },
            ]
          : [],
        page: 1,
        pageSize: 100,
        total: publishedForms ? 1 : 0,
      });
    if (path === "/api/v1/coaching/groups")
      return respond({
        items: groupCreated ? [group] : [],
        page: 1,
        pageSize: 20,
        total: groupCreated ? 1 : 0,
      });
    if (path === `/api/v1/coaching/groups/${groupId}`) return respond(group);
    if (path === `/api/v1/coaching/groups/${groupId}/members`)
      return respond({
        items: grouped ? [relationship()] : [],
        page: 1,
        pageSize: 20,
        total: grouped ? 1 : 0,
      });
    if (path === "/api/v1/coaching/clients")
      return respond({
        items: [relationship()],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    if (path === "/api/v1/training/programs")
      return respond({
        items: [{ id: offerId, name: "Personal strength program" }],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    if (path === `/api/v1/training/programs/${offerId}/revisions`)
      return respond({
        items: [{ id: formId, number: 1 }],
        page: 1,
        pageSize: 100,
        total: 1,
      });
    if (path === "/api/v1/training/assignments")
      return respond({ items: [], page: 1, pageSize: 20, total: 0 });
    if (path === "/api/v1/training/progress")
      return respond({
        completed: 0,
        due: 0,
        completionPercentage: null,
        missed: 0,
        skipped: 0,
        loggedLate: 0,
        actualSets: 0,
        actualReps: 0,
        performance: [],
        clients: [],
        metricDefinition: "Actual execution records only.",
      });
    if (path === "/api/v1/offers")
      return respond({ items: [], page: 1, pageSize: 20, total: 0 });
    if (path === `/api/v1/offers/${offerId}`) return respond(offer);
    if (path === `/api/v1/coaching/applications/${applicationId}`)
      return respond(detail);
    if (path === "/api/v1/me/notifications/unread-count")
      return respond({ count: 0 });
    return respond([]);
  });
  return { writes, reads };
}

test("Team offer creation preserves organization ownership when edited", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/app/offers?scope=team");
  await expect
    .poll(() =>
      state.reads
        .find((url) => url.pathname === "/api/v1/offers")
        ?.searchParams.get("teamId"),
    )
    .toBe(teamId);
  await page
    .getByRole("button", { name: "Create offer", exact: true })
    .first()
    .click();
  const panel = page.getByRole("dialog", { name: "New offer", exact: true });
  await expect(
    panel.getByText("Team-owned offer · Strength Collective", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("textbox", { name: "Offer name", exact: true })
    .fill("Team strength coaching");
  await panel
    .getByRole("textbox", { name: "Option name", exact: true })
    .fill("Individual session");
  await panel.getByRole("radio", { name: "Paid", exact: true }).click();
  await panel
    .getByRole("textbox", { name: "Price per session", exact: true })
    .fill("100");
  await panel
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path === "/api/v1/offers")?.body
          .teamId,
    )
    .toBe(teamId);
  // Creating closes the panel and stays on the list; the new offer opens from there.
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/app\/offers\?scope=team$/);
  await page.goto(`/app/offers/${offerId}`);
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Offer name", exact: true })
    .fill("Updated Team coaching");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path === `/api/v1/offers/${offerId}`)
          ?.body.teamId,
    )
    .toBe(teamId);
});

test("Team application cannot submit without explicit organizational consent", async ({
  page,
}) => {
  const state = await fixture(page, true);
  await page.goto(`/app/applications/${applicationId}`);
  const submit = page.getByRole("button", {
    name: "Submit application",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await expect(
    page.getByText(/Existing private coaching history is not transferred/),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I accept Strength Collective/ })
    .press("Space");
  await expect(
    page.getByRole("checkbox", { name: /I accept Strength Collective/ }),
  ).toBeChecked();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path.endsWith("/submit"))?.body
          .acceptTeamScope,
    )
    .toBe(true);
  await expect(
    page.getByRole("heading", { name: "Your answers", exact: true }),
  ).toBeVisible();
});

test("Team group creation and member picker keep ownership scope", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/app/groups?scope=team");
  await expect
    .poll(() =>
      state.reads
        .find((url) => url.pathname === "/api/v1/coaching/groups")
        ?.searchParams.get("teamId"),
    )
    .toBe(teamId);
  await page
    .getByRole("button", { name: "New group", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "New client group",
    exact: true,
  });
  await expect(
    dialog.getByText("Team-owned group", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Team cohort");
  await dialog
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await expect
    .poll(
      () =>
        state.writes.find((write) => write.path === "/api/v1/coaching/groups")
          ?.body.teamId,
    )
    .toBe(teamId);
  await page.getByRole("link", { name: "Team cohort", exact: true }).click();
  await page
    .getByRole("button", { name: "Add client", exact: true })
    .first()
    .click();
  const memberPicker = page.getByRole("dialog", {
    name: "Add a client",
    exact: true,
  });
  await expect(
    memberPicker.getByText("Choose one of your assigned Team coaching cases.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      state.reads
        .find((url) => url.pathname === "/api/v1/coaching/clients")
        ?.searchParams.get("teamId"),
    )
    .toBe(teamId);
  await memberPicker.getByRole("button", { name: /Client$/ }).click();
  await page
    .getByRole("option", { name: "Assigned Team client", exact: true })
    .click();
  await memberPicker
    .getByRole("button", { name: "Add to group", exact: true })
    .click();
  await expect
    .poll(() =>
      state.writes.some(
        (write) =>
          write.path ===
          `/api/v1/coaching/groups/${groupId}/members/${relationshipId}`,
      ),
    )
    .toBe(true);
  await expect(memberPicker).toBeHidden();
  await expect(
    page.getByRole("table", { name: "Group members", exact: true }),
  ).toContainText("Assigned Team client");
  await page
    .getByRole("tablist", { name: "Group views" })
    .getByRole("tab", { name: "Programs", exact: true })
    .click();
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  const assignment = page.getByRole("dialog", {
    name: "Assign program",
    exact: true,
  });
  await assignment.getByRole("button", { name: /Program$/ }).click();
  await page
    .getByRole("option", { name: "Personal strength program", exact: true })
    .click();
  await expect(
    assignment.getByText(/Recipients are your assigned Team clients/),
  ).toBeVisible();
  await expect(
    assignment.getByRole("checkbox", { name: "Team cohort", exact: true }),
  ).toBeChecked();
  await assignment
    .getByRole("button", { name: "Preview recipients", exact: true })
    .click();
  await expect(
    assignment.getByText(/^1 unique active clients will receive this program/),
  ).toBeVisible();
  expect(
    state.reads
      .filter((url) =>
        ["/api/v1/coaching/clients", "/api/v1/coaching/groups"].includes(
          url.pathname,
        ),
      )
      .every((url) => url.searchParams.get("teamId") === teamId),
  ).toBe(true);
  expect(
    state.writes.find((write) => write.path.endsWith("/assignments/preview"))
      ?.body.groupIds,
  ).toEqual([groupId]);
});

test("invalid offer shows a persistent top-right error and replaces the previous error without saving", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.clock.install();
  await page.goto("/app/offers?create=1");
  const panel = page.getByRole("dialog", { name: "New offer", exact: true });
  await expect(
    panel.getByRole("textbox", { name: "Offer name", exact: true }),
  ).toBeVisible();
  const submit = panel.getByRole("button", {
    name: "Create draft",
    exact: true,
  });
  await submit.click();
  const error = page
    .locator('[role="alert"]')
    .filter({ hasText: "Check the offer details" });
  await expect(error).toHaveCount(1);
  await expect(error).toContainText(
    "Enter an offer name up to 200 characters.",
  );
  await expect(error).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(error).toBeVisible();
  const bounds = await error.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeLessThan(80);
  expect(viewport.width - bounds!.x - bounds!.width).toBeLessThan(40);
  await panel
    .getByRole("textbox", { name: "Offer name", exact: true })
    .fill("Online coaching");
  await submit.click();
  await expect(error).toHaveCount(1);
  await expect(error).toContainText(
    "Billing option 1: enter a name up to 120 characters.",
  );
  await expect(error).not.toContainText("Enter an offer name");
  expect(state.writes).toHaveLength(0);
});

for (const publishedForms of [false, true]) {
  test(`Free offer defaults to no application form with ${publishedForms ? "one" : "no"} published forms`, async ({
    page,
  }) => {
    const state = await fixture(page, false, true, publishedForms);
    await page.goto("/app/offers?scope=team");
    await page
      .getByRole("button", { name: "Create offer", exact: true })
      .first()
      .click();
    const panel = page.getByRole("dialog", { name: "New offer", exact: true });
    await expect(
      panel.getByText("No application form", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      panel.getByRole("radio", { name: "Free", exact: true }),
    ).toBeChecked();
    await panel
      .getByRole("textbox", { name: "Offer name", exact: true })
      .fill("Free coaching");
    await panel
      .getByRole("textbox", { name: "Option name", exact: true })
      .fill("Free session");
    await panel
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await expect
      .poll(
        () =>
          state.writes.find((write) => write.path === "/api/v1/offers")?.body
            .applicationFormVersionId,
      )
      .toBeNull();
    expect(
      state.writes.find((write) => write.path === "/api/v1/offers")?.body
        .billingOptions,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ price: 0, model: "PerSession" }),
      ]),
    );
    await expect(panel).toBeHidden();
  });
}

test("No-form free Team application still requires consent and explicit submission", async ({
  page,
}) => {
  const state = await fixture(page, true, true);
  await page.goto(`/app/applications/${applicationId}`);
  await expect(
    page.getByText("No application form required", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  const submit = page.getByRole("button", {
    name: "Submit application",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I accept Strength Collective/ })
    .press("Space");
  await submit.click();
  await expect
    .poll(
      () => state.writes.find((write) => write.path.endsWith("/submit"))?.body,
    )
    .toMatchObject({
      answers: {},
      acceptTeamScope: true,
      saveProfileFields: [],
    });
  await expect(
    page.getByText("No application form was required.", { exact: true }),
  ).toBeVisible();
});
