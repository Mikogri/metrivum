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
    // The builder is its own screen where the form is edited directly in its client view.
    await page
        .getByRole("textbox", { name: /Form name/ })
        .fill("Recovery check-in");
    await page
        .getByRole("textbox", { name: /^Question/ })
        .first()
        .fill("How rested are you?");
    await page.getByRole("button", { name: /Answer type/ }).first().click();
    await page.getByRole("option", { name: "Scale", exact: true }).click();
    // Edited in place: the scale is drawn right under the question.
    await expect(page.getByText("Minimum", { exact: true }).first()).toBeVisible();
    await page
        .getByRole("button", { name: "Create form", exact: true })
        .click();
    await expect(page).toHaveURL(new RegExp(`/app/forms/${formId}$`));
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
    await page.goBack();
    await expect(
        tabs.getByRole("tab", { name: "Programs", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
});
