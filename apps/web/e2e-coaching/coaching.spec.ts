import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const coach = "00000000-0000-4000-8000-000000000000";
const formId = "10000000-0000-4000-8000-000000000001";
const versionId = "10000000-0000-4000-8000-000000000002";
const relationshipId = "20000000-0000-4000-8000-000000000001";
const now = "2026-10-07T09:00:00Z";
const catalog = JSON.parse(
    readFileSync(
        new URL("../../../contracts/generated/features.json", import.meta.url),
        "utf8",
    ),
) as { key: string }[];
const profile = {
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
    phone: null,
    phoneVisibleToCoach: false,
};
const definition = {
    sections: [
        {
            key: "about",
            title: "About you",
            order: 0,
            questions: [
                {
                    key: "energy",
                    label: "Energy level",
                    type: "Number",
                    required: true,
                    order: 0,
                    min: 0,
                    max: 10,
                },
            ],
        },
    ],
};
const template = {
    id: formId,
    coachId: coach,
    purpose: "CheckIn",
    name: "Weekly review",
    description: "Weekly progress",
    draft: definition,
    currentPublishedVersionId: versionId as string | null,
    archived: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
};
const paged = (items: unknown[], page = 1) => ({
    items,
    page,
    pageSize: 25,
    total: items.length,
});

async function fixture(
    page: Page,
    seedEvent: Record<string, unknown> | null = null,
    assignedPrograms: Record<string, unknown>[] = [],
) {
    const writes: {
        path: string;
        body: Record<string, unknown>;
        etag: string | undefined;
    }[] = [];
    let saved = template;
    let calendarEvent: Record<string, unknown> | null = seedEvent;
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
                        aud: "authenticated",
                    },
                }),
            );
            localStorage.setItem("tf.auth.active-slot", "0");
        },
        { id: coach },
    );
    // Browser-only transport substitution; production auth and API code are unchanged.
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
        const respond = (data: unknown, status = 200) =>
            route.fulfill({
                status,
                json: data,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "*",
                },
            });
        if (request.method() === "OPTIONS") return respond(null, 200);
        if (request.method() !== "GET") {
            const body = request.postDataJSON() ?? {};
            writes.push({ path, body, etag: request.headers()["if-match"] });
            if (path.endsWith("/response") && calendarEvent) {
                calendarEvent = {
                    ...calendarEvent,
                    response: body.status,
                    responseVersion: 2,
                };
                return respond(calendarEvent);
            }
            if (path === "/api/v1/calendar/events") {
                calendarEvent = {
                    id: "30000000-0000-4000-8000-000000000001",
                    coachId: coach,
                    ...body,
                    cancelled: false,
                    version: 1,
                    response: null,
                    responseVersion: null,
                    attendees: [],
                };
                return respond(calendarEvent);
            }
            if (path === "/api/v1/forms") {
                saved = {
                    ...template,
                    ...body,
                    currentPublishedVersionId: null,
                    version: 1,
                };
                return respond(saved);
            }
            if (path === `/api/v1/forms/${formId}/archive` || path === `/api/v1/forms/${formId}/restore`) {
                saved = { ...saved, archived: path.endsWith("/archive"), version: saved.version + 1 };
                return respond(saved);
            }
            if (path === `/api/v1/forms/${formId}/publish`) {
                saved = {
                    ...saved,
                    currentPublishedVersionId: versionId,
                    version: saved.version + 1,
                };
                return respond(saved);
            }
            return respond({});
        }
        if (path === "/api/v1/analyze/overview") {
            const period = {
                from: url.searchParams.get("from"),
                to: url.searchParams.get("to"),
                timeZone: url.searchParams.get("timeZone"),
                start: now,
                end: now,
            };
            const finance = { totals: [], series: [], offers: [] };
            const clients = {
                active: 0,
                suspended: 0,
                completed: 0,
                newClients: 0,
                reactivated: 0,
                departed: 0,
                netGrowth: 0,
                retentionPercent: null,
                series: [],
                groups: [],
            };
            const acquisition = {
                submitted: 0,
                accepted: 0,
                rejected: 0,
                conversionPercent: null,
                invitationsSent: 0,
                invitationsAccepted: 0,
                invitationsDeclined: 0,
                sources: [],
            };
            const checkIns = {
                issued: 0,
                submitted: 0,
                overdue: 0,
                pendingReview: 0,
                submissionRate: null,
                averageReviewHours: null,
                series: [],
            };
            return respond({
                period,
                comparisonPeriod: period,
                finance,
                previousFinance: finance,
                clients,
                previousClients: clients,
                acquisition,
                previousAcquisition: acquisition,
                checkIns,
                previousCheckIns: checkIns,
                training: {
                    available: false,
                    reason: "No session execution logs.",
                },
                messaging: { sent: 0, received: 0, conversations: 0 },
                filters: { groups: [], offers: [] },
            });
        }
        if (path === "/api/v1/calendar/events")
            return respond(paged(calendarEvent ? [calendarEvent] : []));
        if (path.startsWith("/api/v1/calendar/events/"))
            return respond(calendarEvent);
        if (path === "/api/v1/me") return respond(profile);
        if (path === "/api/v1/me/access")
            return respond({
                version: "test",
                features: catalog.map((f) => ({
                    key: f.key,
                    available: true,
                    reason: "available",
                })),
                limits: [],
            });
        if (path === "/api/v1/me/profile-fields")
            return respond({ currency: "EUR", values: {}, version: 1 });
        if (path === "/api/v1/forms")
            return respond(
                paged([
                    {
                        ...saved,
                        purpose:
                            url.searchParams.get("purpose") || "Application",
                    },
                ]),
            );
        if (path === `/api/v1/forms/${formId}`) return respond(saved);
        if (path === "/api/v1/offers/categories")
            return respond([
                { key: "strength", name: "Strength", active: true },
            ]);
        if (
            path === "/api/v1/offers/tags" ||
            path === "/api/v1/me/payment-methods" ||
            path === "/api/v1/me/service-subscriptions" ||
            path === "/api/v1/coaching/services/current" ||
            path === "/api/v1/coaching/earnings"
        )
            return respond([]);
        if (path === "/api/v1/coaching/clients")
            return respond(
                paged([
                    {
                        id: relationshipId,
                        client: {
                            id: relationshipId,
                            displayName: "Test Client",
                            username: "test_client",
                        },
                        status: "Active",
                        groupIds: [],
                        statusHistory: [],
                        allowedActions: ["suspend", "complete"],
                        startedAt: now,
                        version: 1,
                    },
                ]),
            );
        if (path === "/api/v1/coaching/groups") return respond(paged([]));
        if (path === "/api/v1/check-ins/assigned-programs") return respond(assignedPrograms);
        if (
            path === "/api/v1/messaging/conversations" ||
            path === "/api/v1/messaging/requests"
        )
            return respond([]);
        return respond(paged([]));
    });
    return writes;
}

test("coach pages render and stay within the viewport", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await fixture(page);
    for (const [path, heading] of [
        ["forms", "Forms"],
        ["offers", "Offers"],
        [`coaches/${coach}/offers`, "Coach offers"],
        ["leads", "Leads"],
        ["invitations", "Invitations"],
        ["check-ins", "Client check-ins"],
        ["check-in-schedules", "Check-in schedules"],
        ["payments", "My payments"],
        ["earnings", "Analyze"],
    ]) {
        await page.goto(`/app/${path}`);
        if (["payments", `coaches/${coach}/offers`].includes(path)) {
            await page
                .getByRole("button", { name: "Switch workspace", exact: true })
                .click();
        } else if (path === "leads" || path === "earnings") {
            await page
                .getByRole("button", { name: "Switch workspace", exact: true })
                .click();
        }
        await expect(
            page.getByRole("heading", { name: heading, exact: true }).first(),
        ).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth + 2,
                ),
            )
            .toBeTruthy();
    }
    expect(errors).toEqual([]);
});

test("form builder saves typed questions and publishes using the returned version", async ({
    page,
}) => {
    const writes = await fixture(page);
    await page.goto("/app/forms/new?purpose=CheckIn");
    await expect(page.getByRole("textbox", { name: /^Question/ })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /Form name/ })).toHaveValue("");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByRole("textbox", { name: "Section 1 title", exact: true }).fill("Recovery");
    await page.getByRole("button", { name: "Short text", exact: true }).click();
    await page
        .getByRole("textbox", { name: /Form name/ })
        .fill("Recovery check-in");
    await page
        .getByRole("textbox", { name: /^Question/ })
        .first()
        .fill("How rested are you?");
    await page.getByRole("button", { name: "Question 1 actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit question", exact: true }).click();
    await page.getByRole("button", { name: /Answer type/ }).first().click();
    await page.getByRole("option", { name: "Scale", exact: true }).click();
    // Edited in place: the scale is drawn right under the question.
    await expect(page.getByText("Minimum", { exact: true }).first()).toBeVisible();
    await page
        .getByRole("button", { name: "Create form", exact: true })
        .click();
    await expect(page).toHaveURL(new RegExp(`/app/forms/${formId}$`));
    await expect(page.getByRole("status").filter({ hasText: "Form created" })).toBeVisible();
    await page
        .getByRole("button", { name: "Publish form", exact: true })
        .click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[0]!.body.purpose).toBe("CheckIn");
    expect(writes[0]!.body.draft).toMatchObject({
        sections: [
            {
                questions: [
                    {
                        type: "Scale",
                        label: "How rested are you?",
                        min: 1,
                        max: 10,
                    },
                ],
            },
        ],
    });
    expect(writes[1]!.etag).toBe('"1"');
    await expect(page.getByRole("status").filter({ hasText: "Form published" })).toBeVisible();
    await page.getByRole("status").filter({ hasText: "Form published" }).getByRole("button").click();
    await expect(page.getByRole("status").filter({ hasText: "Form published" })).toHaveCount(0);
    await page.getByRole("button", { name: "Publish form", exact: true }).click();
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2]!.etag).toBe('"2"');
    await expect(page.getByRole("status").filter({ hasText: "Form published" })).toBeVisible();
    await page.screenshot({
        path: `../../.local/stage-02/form-${test.info().project.name}.png`,
        fullPage: true,
    });
});

test("schedule editor selects the sole published form and supports explicit recipients", async ({
    page,
}) => {
    await fixture(page);
    await page.goto("/app/check-in-schedules/new");
    await expect(
        page.getByRole("button", { name: /Check-in form/ }),
    ).toContainText("Weekly review");
    await page.getByRole("textbox", { name: /^Name/ }).fill("Weekly review");
    await page.getByText("Test Client", { exact: true }).click();
    await expect(
        page.getByRole("checkbox", { name: /Test Client/ }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "Monthly", exact: true }).click();
    await page.getByRole("textbox", { name: /Day of the month/ }).fill("31");
    await expect(
        page.getByRole("button", { name: "Create schedule", exact: true }),
    ).toBeEnabled();
    await page.screenshot({
        path: `../../.local/stage-02/schedule-${test.info().project.name}.png`,
        fullPage: true,
    });
});

test("assigned ten-day cycles offer cycle days and an editable release time", async ({ page }) => {
    await fixture(page, null, [{
        assignmentId: "30000000-0000-4000-8000-000000000010",
        relationshipId,
        programName: "Ten-day program",
        timeZone: "Europe/Warsaw",
        active: true,
        ended: false,
        cycles: [{ cycleId: "40000000-0000-4000-8000-000000000010", startDate: "2026-10-16", dayCount: 10 }],
    }]);
    await page.goto(`/app/check-in-schedules/new?relationshipId=${relationshipId}`);
    await page.getByRole("textbox", { name: /^Name/ }).fill("Cycle review");
    await page.getByRole("radio", { name: "Program cycle", exact: true }).click();
    const cycleDays = page.getByRole("group", { name: "Program cycle days" });
    await expect(cycleDays.getByRole("button")).toHaveCount(10);
    await cycleDays.getByRole("button", { name: "Day 10", exact: true }).click();
    await expect(cycleDays.getByRole("button", { name: "Day 10", exact: true })).toHaveAttribute("aria-pressed", "true");
    const release = page.locator('input[type="time"]');
    await release.fill("18:45");
    await expect(release).toHaveValue("18:45");
    await expect(page.getByRole("button", { name: "Create schedule", exact: true })).toBeEnabled();
    await expect(page.getByText("Assignment time zone: Europe/Warsaw.", { exact: false })).toBeVisible();
    await page.screenshot({ path: `../../.local/refactor-2026-10-11/checkin-cycle-${test.info().project.name}.png`, fullPage: true });
    await release.fill("");
    await expect(page.getByRole("button", { name: "Create schedule", exact: true })).toBeDisabled();
});

test("dirty edits survive cancelled navigation and leave only after explicit discard", async ({
    page,
}) => {
    await fixture(page);
    await page.goto(`/app/forms/${formId}`);
    await page
        .getByRole("textbox", { name: /Form name/ })
        .fill("Unsaved local change");
    await page
        .getByRole("button", { name: "Back", exact: true })
        .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
    await expect(page.getByRole("textbox", { name: /Form name/ })).toHaveValue(
        "Unsaved local change",
    );
    await page
        .getByRole("button", { name: "Back", exact: true })
        .click();
    await page
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
    await expect(page).toHaveURL(/\/app\/forms$/);
});

test("calendar views, creation and dated check-ins work", async ({ page }) => {
    const writes = await fixture(page);
    await page.goto("/app/calendar?date=2026-11-04&view=month");
    await expect(
        page.getByRole("heading", { name: "Calendar", exact: true }),
    ).toBeVisible();
    for (const view of ["Week", "Year", "Month"]) {
        await page.getByRole("radio", { name: view, exact: true }).click();
        await expect(
            page.getByRole("radio", { name: view, exact: true }),
        ).toHaveAttribute("aria-checked", "true");
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth + 2,
                ),
            )
            .toBeTruthy();
    }
    await page
        .getByRole("button", { name: "New meeting", exact: true })
        .click();
    await page
        .getByRole("textbox", { name: /^Title/ })
        .fill("Technique session");
    await page
        .getByRole("button", { name: "Create meeting", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Technique session/ }).first().click();
    await expect(
        page.getByRole("heading", { name: "Technique session", exact: true }),
    ).toBeVisible();
    expect(writes[0]!.body.startsAtUtc).toBe("2026-11-04T08:00:00.000Z");
    await page
        .getByRole("dialog", { name: "Details", exact: true })
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await page.reload();
    await expect(
        page.getByRole("button", { name: /Technique session/ }).first(),
    ).toBeVisible();
    await page.screenshot({
        path: `../../.local/workspaces-calendar/calendar-${test.info().project.name}.png`,
        fullPage: true,
    });
    await page
        .getByRole("button", { name: "Schedule check-in", exact: true })
        .click();
    await expect(
        page.getByRole("radio", { name: "Once", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
        page.getByRole("spinbutton", { name: /^month/i }).first(),
    ).toHaveAttribute("aria-valuenow", "11");
    await expect(
        page.getByRole("spinbutton", { name: /^day/i }).first(),
    ).toHaveAttribute("aria-valuenow", "4");
});

test("workspaces replace the whole menu and preserve cancelled drafts", async ({
    page,
}) => {
    await fixture(page);
    await page.goto(`/app/forms/${formId}`);
    await page
        .getByRole("textbox", { name: /Form name/ })
        .fill("Keep this draft");
    const switchClient = async () => {
        await page
            .getByRole("radiogroup", { name: "Workspace view" })
            .getByRole("radio", { name: "Client", exact: true })
            .click();
    };
    await switchClient();
    await page
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
    await expect(page.getByRole("textbox", { name: /Form name/ })).toHaveValue(
        "Keep this draft",
    );
    await switchClient();
    await page
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
    await expect(page).toHaveURL(/\/app\/my-coaches$/);
    await expect(
        page.getByRole("link", { name: "New program", exact: true }),
    ).toHaveCount(0);
    await page.goto("/app/clients");
    await page
        .getByRole("button", { name: "Switch workspace", exact: true })
        .click();
    await expect(
        page
            .getByRole("tablist", { name: "Clients sections" })
            .getByRole("tab"),
    ).toHaveCount(5);
    await page
        .getByRole("tablist", { name: "Clients sections" })
        .getByRole("tab", { name: "Groups", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "Groups", exact: true }),
    ).toBeVisible();
});

test("client can identify the organizer and accept a calendar invitation", async ({
    page,
}) => {
    const eventId = "30000000-0000-4000-8000-000000000002";
    const writes = await fixture(page, {
        id: eventId,
        coachId: "40000000-0000-4000-8000-000000000001",
        organizerName: "Alex Coach",
        kind: "Meeting",
        title: "Client review",
        description: "Progress review",
        timeZone: "Europe/Warsaw",
        startsAtUtc: "2026-11-04T08:00:00Z",
        endsAtUtc: "2026-11-04T09:00:00Z",
        startDate: null,
        endDateExclusive: null,
        location: null,
        meetingUrl: null,
        cancelled: false,
        version: 4,
        response: "Pending",
        responseVersion: 1,
        attendees: null,
    });
    await page.addInitScript(
        (id) => localStorage.setItem(`tf.workspace.0:${id}`, "client"),
        coach,
    );
    await page.goto("/app/calendar?date=2026-11-04");
    await page
        .getByRole("button", { name: /Client review/ })
        .first()
        .click();
    await expect(page.getByText("Alex Coach", { exact: true })).toBeVisible();
    await expect(page.getByText("Organiser", { exact: true })).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Edit", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText(/You accepted this invitation/)).toBeVisible();
    expect(writes[0]!.etag).toBe('"1"');
    expect(writes[0]!.body).toEqual({ status: "Accepted" });
});

test("programs and templates share the inner menu", async ({ page }) => {
    await fixture(page);
    await page.goto("/app/programs");
    const tabs = page.getByRole("tablist", { name: "Programs sections" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    const header = await page
        .getByRole("heading", { name: "Programs", exact: true })
        .boundingBox();
    const menu = await tabs.boundingBox();
    expect(menu!.y).toBeGreaterThan(header!.y + header!.height);
    await tabs.getByRole("tab", { name: "Templates", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/templates$/);
    await expect(
        tabs.getByRole("tab", { name: "Templates", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
        page.getByRole("link", { name: "Templates", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
        path: `../../.local/workspaces-calendar/inner-menu-${test.info().project.name}.png`,
        fullPage: true,
    });
    // Hub tabs replace the current history entry; return through the same inner menu.
    await tabs.getByRole("tab", { name: "Programs", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/programs$/);
    await expect(
        tabs.getByRole("tab", { name: "Programs", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
});


test("archived forms can be restored directly from cards or the list", async ({ page }) => {
    const writes = await fixture(page);
    await page.goto(`/app/forms/${formId}`);
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Form archived" })).toBeVisible();
    await page.goto("/app/forms?archived=true&view=cards");
    await expect(page.getByRole("article").filter({ hasText: "Weekly review" })).toBeVisible();
    if ((page.viewportSize()?.width ?? 1280) >= 768) {
        await page.getByRole("radio", { name: "Table", exact: true }).click();
        await expect(page.getByRole("table", { name: "Forms" })).toBeVisible();
    }
    await page.getByRole("button", { name: "Restore form", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Form restored" })).toBeVisible();
    expect(writes.at(-1)).toMatchObject({ path: `/api/v1/forms/${formId}/restore`, etag: '"2"' });
});

async function clientDetailsFixture(page: Page) {
    const writes = await fixture(page);
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    let reviewed = false;
    const requestId = "20000000-0000-4000-8000-000000000009";
    const request = () => ({ id: requestId, relationshipId, scheduleId: formId, scheduleName: "Weekly review", formVersionId: versionId, availableAtUtc: now, dueAtUtc: now, submittedAt: now, reviewedAt: reviewed ? now : null, reviewedBy: reviewed ? coach : null, status: reviewed ? "Reviewed" : "Submitted", wasLate: false, version: reviewed ? 2 : 1, clientReply: reviewed ? "Good work" : null, assignmentSource: "Group", assignmentGroups: [{ id: formId, name: "Strength group" }] });
    await page.addInitScript(id => localStorage.setItem(`tf.workspace.0:${id}`, "coach"), coach);
    await page.route("http://mock.trainflow.invalid/**", async route => {
        const path = new URL(route.request().url()).pathname;
        const respond = (data: unknown) => route.fulfill({ headers, json: data });
        if (route.request().method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
        if (path === `/api/v1/check-ins/requests/${requestId}/review`) {
            reviewed = true;
            expect(route.request().headers()["if-match"]).toBe('"1"');
            return respond(request());
        }
        if (path === `/api/v1/coaching/clients/${relationshipId}`) return respond({ id: relationshipId, client: { id: relationshipId, displayName: "Test Client", username: "test_client" }, status: "Active", startedAt: "2020-02-03T12:00:00Z", groupIds: [], statusHistory: [], allowedActions: ["suspend", "complete"], version: 1, teamId: null });
        if (path === "/api/v1/teams/mine") return respond({ teams: [], requests: [] });
        if (path === "/api/v1/training/last-activity") return respond({ performedDate: null, completedAt: null });
        if (path === "/api/v1/training/assignment-summary") return respond(paged([]));
        if (path === `/api/v1/check-ins/relationships/${relationshipId}/summary`) return respond({ awaitingReview: reviewed ? 0 : 1, overdue: 0, submitted: reviewed ? 0 : 1, reviewed: reviewed ? 1 : 0, lastCheckIn: request(), nextDueAtUtc: null });
        if (path === "/api/v1/check-ins/requests") return respond(paged([request()]));
        if (path === `/api/v1/check-ins/relationships/${relationshipId}/requests/${requestId}`) return respond({ request: request(), form: { id: versionId, coachId: coach, name: "Weekly review", number: 1, definition }, submission: { answers: { energy: 7 } }, coachPrivateNotes: null });
        if (path === `/api/v1/coaching/relationships/${relationshipId}/billing`) return respond({ dues: paged([{ id: formId, serviceId: versionId, relationshipId, dueAt: now, amount: 50, currency: "USD", status: "Paid", settlementMode: "External", settlementSource: "Bank", overdue: false }]), payments: [], transactions: [], attempts: [], orders: [], summary: { lastSettlement: null, overdueByCurrency: [], nextDue: null } });
        if (path === `/api/v1/coaching/relationships/${relationshipId}/profile`) return respond({ currentAllowedProfile: { TrainingExperience: "Intermediate" } });
        await route.fallback();
    });
    return { writes, requestId, reviewed: () => reviewed };
}

test("Client Details has six scoped tabs and right-side check-in and payment drawers", async ({ page }) => {
    test.setTimeout(90000);
    const f = await clientDetailsFixture(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/app/clients/${relationshipId}`, { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("tablist", { name: "Client views" });
    await expect(tabs.getByRole("tab")).toHaveText(["Overview", "Activity", "Progress", "Profile", "Documentation", "Check-ins"]);
    await expect(page.getByRole("heading", { name: /Test Client/ })).toBeVisible();
    const header = page.getByRole("heading", { name: /Test Client/ }).locator("xpath=ancestor::header[1]");
    await expect(header).not.toContainText("2020");
    await expect(header).toContainText("Private");
    await page.getByRole("button", { name: "View history", exact: true }).click();
    const payments = page.getByRole("dialog", { name: "Payment history", exact: true });
    await expect(payments.getByRole("table", { name: "Relationship payment dues" })).toContainText("External");
    await expect(payments.locator("xpath=ancestor::*[@data-placement='right'][1]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(payments).toHaveCount(0);
    await tabs.getByRole("tab", { name: "Check-ins", exact: true }).click();
    await page.getByRole((page.viewportSize()?.width ?? 1280) < 768 ? "list" : "table", { name: "Client check-ins" }).getByRole("button", { name: /Weekly review/ }).click();
    const drawer = page.getByRole("dialog", { name: "Check-in details", exact: true });
    await expect(drawer).toContainText("Energy level");
    await expect(drawer).toContainText("7");
    expect(f.reviewed()).toBe(false);
    await expect(page).toHaveURL(new RegExp(`checkIn=${f.requestId}`));
    await drawer.getByRole("textbox", { name: "Reply visible to the client" }).fill("Good work");
    await drawer.getByRole("button", { name: "Mark as reviewed", exact: true }).click();
    await expect(drawer.getByRole("heading", { name: "Coach reply", exact: true })).toBeVisible();
    await expect(drawer).toContainText("Good work");
    expect(f.reviewed()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/tab=check-ins/);
    await tabs.getByRole("tab", { name: "Profile", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByText("Intermediate", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBeTruthy();
    await page.screenshot({ path: `../../.local/client-details-${test.info().project.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
});

test("Client Details retains check-in filters and protects unsaved review on close", async ({ page }) => {
    test.setTimeout(90000);
    const f = await clientDetailsFixture(page);
    await page.goto(`/app/clients/${relationshipId}?tab=check-ins&ciSort=due&checkIn=${f.requestId}`, { waitUntil: "domcontentloaded" });
    const drawer = page.getByRole("dialog", { name: "Check-in details", exact: true });
    await drawer.getByRole("textbox", { name: "Private coach notes" }).fill("Unsaved thought");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("alertdialog", { name: "Discard unsaved review?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(drawer.getByRole("textbox", { name: "Private coach notes" })).toHaveValue("Unsaved thought");
    await drawer.getByRole("textbox", { name: "Private coach notes" }).focus();
    await page.keyboard.press("Escape");
    await confirm.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/ciSort=due/);
    expect(f.reviewed()).toBe(false);
});

test("Invitations autocomplete users and open a person detail outside the list menu", async ({ page }) => {
    test.setTimeout(90000);
    await fixture(page);
    const invitationId = "70000000-0000-4000-8000-000000000001";
    await page.route("**/api/v1/accounts/people?*", route => route.fulfill({ json: [{ userId: relationshipId, username: "test_client", displayName: "Test Client" }], headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } }));
    await page.route(`**/api/v1/coaching/invitations/${invitationId}`, route => route.fulfill({ json: {
        id: invitationId, coachId: coach, coach: { id: coach, username: "test_coach", displayName: "Test Coach" },
        targetUserId: relationshipId, target: { id: relationshipId, username: "test_client", displayName: "Test Client" },
        offerRevision: { name: "Personal coaching", description: "Offer terms", billingOptions: [], currency: "USD" },
        status: "Pending", message: "Let's train", version: 1, allowedActions: ["revoke"]
    }, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } }));
    await page.goto("/app/invitations", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Invite client", exact: true }).click();
    const input = page.getByRole("combobox", { name: "Client username" });
    await input.fill("test_");
    await page.getByRole("option", { name: "@test_client", exact: true }).click();
    await expect(input).toHaveValue("test_client");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto(`/app/invitations/${invitationId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Test Client/ })).toBeVisible();
    await expect(page.getByText("@test_client", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Clients sections" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke invitation" })).toBeVisible();
});
