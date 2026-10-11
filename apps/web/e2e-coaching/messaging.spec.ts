import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const me = "00000000-0000-4000-8000-000000000000",
    peer = "00000000-0000-4000-8000-000000000001",
    chat = "00000000-0000-4000-8000-000000000002";
const now = "2026-10-07T10:00:00.000001Z";
const features = JSON.parse(
    readFileSync(
        new URL("../../../contracts/generated/features.json", import.meta.url),
        "utf8",
    ),
);
const voiceWav = Buffer.alloc(16044);
voiceWav.write("RIFF", 0); voiceWav.writeUInt32LE(16036, 4); voiceWav.write("WAVEfmt ", 8);
voiceWav.writeUInt32LE(16, 16); voiceWav.writeUInt16LE(1, 20); voiceWav.writeUInt16LE(1, 22);
voiceWav.writeUInt32LE(8000, 24); voiceWav.writeUInt32LE(16000, 28); voiceWav.writeUInt16LE(2, 32); voiceWav.writeUInt16LE(16, 34);
voiceWav.write("data", 36); voiceWav.writeUInt32LE(16000, 40);
async function fixture(
    page: Page,
    options: { failFirst?: boolean; removed?: boolean; pending?: "incoming" | "outgoing" } = {},
) {
    const writes: {
        path: string;
        body: Record<string, unknown>;
        key?: string;
    }[] = [];
    let failed = false;
    let requestPending = Boolean(options.pending);
    let requireApproval = false;
    const messages = [
        {
            id: "first",
            conversationId: chat,
            senderUserId: peer,
            type: "Text",
            body: "Ready for your next session?",
            replyToMessageId: null,
            createdAt: now,
            cursor: "first",
            deletedAt: null as string | null,
            attachments: [] as unknown[],
        },
    ];
    const member = (id: string, displayName: string) => ({
        userId: id,
        displayName,
        username: id === peer ? "alex_morgan" : "test_coach",
        role: "Member",
        source: "Direct",
        state: options.removed && id === me ? "Removed" : "Active",
        excluded: false,
        joinedAt: now,
        removedAt: null,
        lastReadMessageId: null,
    });
    const conversation = () => ({
        id: chat,
        type: "Direct",
        title: "Alex Morgan",
        clientGroupId: null,
        membershipState: options.removed ? "Removed" : "Active",
        canSendMessages: !options.removed && !requestPending,
        canUploadAttachments: !options.removed && !requestPending,
        request: requestPending ? { id: "request", state: "Pending", senderUserId: options.pending === "incoming" ? peer : me, recipientUserId: options.pending === "incoming" ? me : peer, conversationId: chat, body: "Ready for your next session?", createdAt: now } : null,
        lastMessage: messages.at(-1),
        unreadCount: 1,
        members: [member(me, "Test Coach"), member(peer, "Alex Morgan")],
    });
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
        { id: me },
    );
    await page.route("**/shared/dev/mockApi.ts*", (route) =>
        route.fulfill({
            contentType: "text/javascript",
            body: "export const mockFetch = (input, init) => fetch(input, init);",
        }),
    );
    await page.route("http://mock.trainflow.invalid/**", async (route) => {
        const request = route.request(),
            path = new URL(request.url()).pathname;
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
        if (request.method() === "OPTIONS") return respond(null);
        if (path.endsWith("/messaging-preferences")) {
            if (request.method() === "PUT") requireApproval = request.postDataJSON().requireApproval;
            return respond({ requireApproval });
        }
        if (request.method() !== "GET") {
            const body = request.postDataJSON() ?? {};
            writes.push({
                path,
                body,
                key: request.headers()["idempotency-key"],
            });
            if (request.method() === "DELETE" && path.includes("/messages/")) {
                const message = messages.find(item => path.endsWith("/" + item.id));
                if (message) { message.body = ""; message.attachments = []; message.deletedAt = new Date().toISOString(); return respond(message); }
            }
            if (path.endsWith("/uploads/"))
                return respond({
                    file: { id: "media", version: 1 },
                    uploadUrl: "http://uploads.trainflow.invalid/file",
                    method: "PUT",
                    expiresAt: now,
                });
            if (path.endsWith("/uploads/media/finalize"))
                return respond({ id: "media", version: 2, state: "Ready" });
            if (path.endsWith("/messages")) {
                if (options.failFirst && !failed) {
                    failed = true;
                    return respond({ detail: "Temporary send failure" }, 503);
                }
                const message = {
                    ...messages[0]!,
                    ...body,
                    id: `sent-${messages.length}`,
                    senderUserId: me,
                    createdAt: "2026-10-07T10:01:00Z",
                    cursor: "sent",
                    attachments: body.type === "VoiceMessage" ? [{ mediaId: "media", contentType: "audio/wav", size: 1644, durationMs: 1000 }] : [],
                };
                messages.push(message);
                return respond(message);
            }
            if (path.endsWith("/accept")) { requestPending = false; return respond({ state: "Accepted", conversationId: chat }); }
            if (path.endsWith("/conversations/direct"))
                return respond(conversation());
            return respond(null, 204);
        }
        if (path.includes("/attachments/")) return route.fulfill({ body: voiceWav, contentType: "audio/wav", headers: { "Access-Control-Allow-Origin": "*" } });
        if (path === "/api/v1/me")
            return respond({
                id: me,
                workspaceId: me,
                username: "test_coach",
                displayName: "Test Coach",
                locale: "en",
                timeZone: "UTC",
                onboarded: true,
                version: 1,
                roles: ["Coach", "Client"],
                contexts: ["Coach", "Client"],
            });
        if (path === "/api/v1/me/access")
            return respond({
                version: "test",
                features: features.map((f: { key: string }) => ({
                    key: f.key,
                    available: true,
                    reason: "available",
                })),
                limits: [],
            });
        if (path.endsWith("/people")) return respond([{ userId: peer, displayName: "Alex Morgan", username: "alex" }]);
        if (path.endsWith("/blocked-users")) return respond([]);
        if (path.endsWith("/conversations")) return respond([conversation()]);
        if (path.endsWith(`/conversations/${chat}`))
            return respond(conversation());
        if (path.endsWith("/messages"))
            return respond({
                items: [...messages].reverse(),
                olderCursor: "first",
                newerCursor: "sent",
            });
        if (path.endsWith("/requests"))
            return respond([
                {
                    id: "request",
                    senderUserId: peer,
                    recipientUserId: me,
                    senderDisplayName: "Alex Morgan",
                    recipientDisplayName: "Test Coach",
                    body: "Could we work together?",
                    state: "Pending",
                    conversationId: null,
                    createdAt: now,
                },
            ]);
        if (path.endsWith("/clients"))
            return respond({
                items: [
                    {
                        status: "Active",
                        client: {
                            id: peer,
                            displayName: "Alex Morgan",
                            username: "alex",
                        },
                    },
                ],
                total: 1,
            });
        return respond({ items: [], total: 0 });
    });
    return writes;
}
test("Messaging sends replies, preserves retry identity and fits mobile", async ({
    page,
}) => {
    const writes = await fixture(page, { failFirst: true, removed: false });
    await page.goto("/app/messages");
    await expect(page).toHaveURL(new RegExp("conversation=" + chat));
    await expect(
        page.getByLabel("Message history").getByText("Ready for your next session?", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Message history").locator("time")).toHaveCount(0);
    await page.getByLabel("Message history").getByRole("article").first().hover();
    await page.getByRole("button", { name: "Message options", exact: true }).first().click();
    await page.getByRole("menuitem", { name: "Reply", exact: true }).click();
    await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Yes, see you tomorrow!");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
        page.getByRole("alert").filter({ hasText: "Temporary send failure" }),
    ).toBeVisible();
    await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Yes, see you tomorrow!");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("");
    expect(
        writes.filter((x) => x.path.endsWith("/messages")).map((x) => x.key),
    ).toEqual([expect.any(String), expect.any(String)]);
    const sends = writes.filter((x) => x.path.endsWith("/messages"));
    expect(sends[0]!.key).toBe(sends[1]!.key);
    expect(sends[1]!.body.replyToMessageId).toBe("first");
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 2,
            ),
        )
        .toBeTruthy();
    await page.screenshot({
        path: `../../.local/messaging/ui-${test.info().project.name}.png`,
        fullPage: true,
    });
});
test("Messaging inline approval, direct creation and unsent draft guard", async ({
    page,
}) => {
    const writes = await fixture(page, { pending: "incoming" });
    await page.goto("/app/messages?tab=requests");
    await expect(
        page.getByText("Accept this conversation to reply.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeVisible();
    await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Keep my draft");
    // On phones the open thread covers the list, so leaving goes through the back button.
    const blockedTab = page.getByRole("radio", { name: /Blocked/ });
    if (await blockedTab.isVisible()) await blockedTab.click();
    else await page.getByRole("button", { name: "Back to conversations", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
        .getByRole("button", { name: "Keep writing", exact: true })
        .click();
    await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Keep my draft");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("");
    const back = page.getByRole("button", { name: "Back to conversations", exact: true });
    if (await back.isVisible()) await back.click();
    await page
        .getByRole("button", { name: "New conversation", exact: true })
        .first()
        .click();
    await page.getByRole("combobox", { name: "Find a person" }).fill("al");
    await page.getByRole("option", { name: "@alex", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    expect(
        writes.some(
            (x) =>
                x.path.endsWith("/conversations/direct") &&
                x.body.userId === peer,
        ),
    ).toBeTruthy();
});
test("Messaging removed member sees history without composer", async ({
    page,
}) => {
    await fixture(page, { failFirst: false, removed: true });
    await page.goto(`/app/messages?conversation=${chat}`);
    await expect(
        page.getByLabel("Message history").getByText("Ready for your next session?", { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/no longer take part/)).toBeVisible();
});

test("Messaging uploads private files without forwarding the API bearer token", async ({
    page,
}) => {
    const writes = await fixture(page);
    let authorization: string | undefined;
    let uploaded = false;
    await page.route("http://uploads.trainflow.invalid/**", (route) => {
        if (route.request().method() === "PUT") {
            uploaded = true;
            authorization = route.request().headers().authorization;
        }
        return route.fulfill({
            status: 200,
            body: "",
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        });
    });
    await page.goto(`/app/messages?conversation=${chat}`);
    await page
        .locator('input[type="file"]')
        .setInputFiles({
            name: "session.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("%PDF-1.7 fixture"),
        });
    await expect(page.getByText("session.pdf", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect
        .poll(() => writes.filter((x) => x.path.endsWith("/messages")).length)
        .toBe(1);
    expect(uploaded).toBeTruthy();
    expect(authorization).toBeUndefined();
    expect(
        writes.find((x) => x.path.endsWith("/messages"))!.body,
    ).toMatchObject({ type: "File", mediaIds: ["media"] });
});

test("Autocomplete opens a private chat without notifying until the first message", async ({ page }) => {
    await fixture(page);
    let requestBody: Record<string, unknown> | null = null;
    let posts = 0;
    await page.route("**/messaging/conversations/direct", route => route.fulfill({ status: route.request().method() === "OPTIONS" ? 200 : 403, json: { code: "MESSAGE_REQUEST_REQUIRED" }, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } }));
    await page.route("**/messaging/requests", route => {
        if (route.request().method() === "POST") {
            posts++;
            requestBody = { ...route.request().postDataJSON(), id: "new-request", senderUserId: me, recipientUserId: peer, state: "Pending", createdAt: now, conversationId: null };
        }
        return route.fulfill({ json: route.request().method() === "POST" ? requestBody : requestBody ? [requestBody] : [], headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    });
    await page.goto("/app/messages");
    await expect(page).toHaveURL(new RegExp("conversation=" + chat));
    const back = page.getByRole("button", { name: "Back to conversations", exact: true });
    // On phones the opened thread covers the list; wait for it before going back.
    if (test.info().project.name === "mobile") {
        await back.click();
        await expect(page).not.toHaveURL(/conversation=/);
    }
    await page.getByRole("button", { name: "New conversation", exact: true }).first().click();
    await page.getByRole("combobox", { name: "Find a person" }).fill("al");
    await page.getByRole("option", { name: "@alex", exact: true }).click();
    await expect(page).toHaveURL(/person=/);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await expect(input).toBeVisible();
    expect(posts).toBe(0);
    await input.fill("Hello from the chat");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Message sent. You can continue when they accept.")).toBeVisible();
    await expect(page.getByText("Hello from the chat", { exact: true })).toBeVisible();
    expect(posts).toBe(1);
    await page.reload();
    await expect(page.getByText("Hello from the chat", { exact: true })).toBeVisible();
});

test("Own message appears before the send response and changes status after acknowledgement", async ({ page }) => {
    await fixture(page);
    let acknowledge!: () => void;
    const held = new Promise<void>(resolve => { acknowledge = resolve; });
    await page.route("**/messaging/conversations/*/messages", async route => {
        if (route.request().method() === "POST") await held;
        await route.fallback();
    });
    await page.goto(`/app/messages?conversation=${chat}`);
    await expect(page.getByText("@alex_morgan", { exact: true })).toBeVisible();
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await input.fill("This appears immediately");
    await input.press("Enter");
    const history = page.getByLabel("Message history");
    await expect(history.getByText("This appears immediately", { exact: true })).toBeVisible();
    await expect(history.getByText("Sending…", { exact: true })).toBeVisible();
    await expect(input).toHaveValue("");
    acknowledge();
    await expect(history.getByText("Sent", { exact: true })).toBeVisible();
    await expect(history.getByText("This appears immediately", { exact: true })).toHaveCount(1);
    await expect(history.locator("time")).toHaveCount(0);
});

test("Notification bell persists safe history, read actions and preferences with a sidebar count", async ({ page }) => {
    await fixture(page);
    let read = false;
    let finishRead!: () => void;
    const readResponse = new Promise<void>(resolve => { finishRead = resolve; });
    let preferences = { messaging: true, checkIns: true, coaching: true, system: true };
    await page.route("**/api/v1/me/notification**", async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers });
        if (path.endsWith("notification-preferences")) {
            if (request.method() === "PATCH") preferences = request.postDataJSON();
            return route.fulfill({ json: preferences, headers });
        }
        if (request.method() === "POST") { await readResponse; read = true; return route.fulfill({ status: 204, headers }); }
        const active = url.searchParams.get("activeConversation") === chat;
        if (path.endsWith("unread-count")) return route.fulfill({ json: { count: active ? 1 : read ? 1 : 2 }, headers });
        const items = [
            ...(!active ? [{ id: "message-notification", type: "MessageCreated", category: "Messaging", sourceModule: "Messaging", sourceId: chat, deepLink: `/app/messages?conversation=${chat}`, createdAt: now, readAt: read ? now : null }] : []),
            { id: "invitation-notification", type: "InvitationReceived", category: "Coaching", sourceModule: "Coaching", sourceId: "invite", deepLink: "/app/invitations/invite", createdAt: now, readAt: null },
        ];
        return route.fulfill({ json: { items, page: 1, pageSize: 25, total: items.length }, headers });
    });
    await page.goto("/app/my-invitations");
    const navMessage = page.getByRole("link", { name: /^Messages/ }).first();
    if (await navMessage.isVisible()) await expect(navMessage).toContainText("2");
    await page.getByRole("button", { name: /Notifications, 2 unread/ }).click();
    const panel = page.getByRole("dialog", { name: "Notifications", exact: true });
    await expect(panel.getByText("Message received", { exact: true })).toBeVisible();
    await expect(panel.getByText("Coaching invitation received", { exact: true })).toBeVisible();
    await expect(panel.getByText("Ready for your next session?", { exact: true })).toHaveCount(0);
    const markRead = panel.getByRole("button", { name: "Mark as read", exact: true }).first();
    await markRead.click();
    await expect(markRead).toHaveAttribute("data-pending", "true");
    await expect(page.getByRole("button", { name: /Notifications, 1 unread/ })).toBeVisible();
    expect(read).toBe(false);
    finishRead();
    await expect(page.getByRole("status").filter({ hasText: "Notification marked as read" })).toHaveCount(0);
    await expect(markRead).not.toHaveAttribute("data-pending", "true");
    await panel.getByRole("button", { name: "Preferences", exact: true }).click();
    await panel.getByRole("checkbox", { name: "Check-ins", exact: true }).focus();
    await panel.getByRole("checkbox", { name: "Check-ins", exact: true }).press("Space");
    await expect.poll(() => preferences.checkIns).toBe(false);
    await panel.getByRole("button", { name: "Mute notification sound" }).click();
    await expect(panel.getByRole("button", { name: "Enable notification sound" })).toBeVisible();
    await panel.getByRole("button", { name: /^Message received/ }).click();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect.poll(() => read).toBe(true);
    if (await navMessage.isVisible()) await expect(navMessage).toHaveText("Messages");
    await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
    await expect(panel.getByText("Message received", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Enable notification sound" })).toBeVisible();
    await page.screenshot({ path: `../../.local/messaging/notifications-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
});

test("Only the final own message has a status, and actions are in the ellipsis menu", async ({ page }) => {
    await fixture(page);
    await page.goto(`/app/messages?conversation=${chat}`);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    for (const body of ["First update", "Second update"]) {
        await input.fill(body);
        await input.press("Enter");
        await expect(input).toBeEnabled();
        await expect(page.getByLabel("Message history").getByText(body, { exact: true })).toBeVisible();
    }
    const history = page.getByLabel("Message history");
    await expect(history.getByText("Sent", { exact: true })).toHaveCount(1);
    await expect(history.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);
    await history.getByRole("article").first().hover();
    await history.getByRole("button", { name: "Message options" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Reply", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Report", exact: true })).toBeVisible();
});


test("Chats opens the latest conversation when returning from Blocked", async ({ page }) => {
    await fixture(page);
    for (const section of ["blocked"]) {
        await page.goto(`/app/messages?tab=${section}`);
        await expect(page.getByRole("heading", { name: "Blocked people", exact: true })).toBeVisible();
        const chats = page.getByRole("radio", { name: "Chats", exact: true });
        if (await chats.isVisible()) await chats.click();
        else await page.getByRole("button", { name: "Back to conversations", exact: true }).click();
        await expect(page).toHaveURL(new RegExp("conversation=" + chat));
        await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
        const back = page.getByRole("button", { name: "Back to conversations", exact: true });
        if (await back.isVisible()) {
            await back.click();
            await expect(page).toHaveURL(/view=list/);
            await expect(page.getByRole("button", { name: /Alex Morgan/ })).toBeVisible();
        }
    }
});


test("Own message deletion leaves a durable tombstone", async ({ page }) => {
    await fixture(page);
    let finishDelete!: () => void;
    const deletion = new Promise<void>(resolve => { finishDelete = resolve; });
    await page.route("**/api/v1/messaging/messages/*", async route => {
        if (route.request().method() === "DELETE") await deletion;
        await route.fallback();
    });
    await page.goto(`/app/messages?conversation=${chat}`);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Delete my message");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const article = page.getByLabel("Message history").getByRole("article").filter({ hasText: "Delete my message" });
    await article.hover();
    await article.getByRole("button", { name: "Message options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete message" }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Delete this message?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Keep message" }).click();
    await expect(article).toBeVisible();
    await article.getByRole("button", { name: "Message options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete message" }).click();
    await confirmation.getByRole("button", { name: "Delete message", exact: true }).click();
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Delete message", exact: true })).toHaveAttribute("data-pending", "true");
    await expect(confirmation.getByRole("button", { name: "Keep message" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeVisible();
    finishDelete();
    await expect(page.getByLabel("Message history").getByText("This message was deleted", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Message deleted" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Message history").getByText("This message was deleted", { exact: true })).toBeVisible();
    await expect(page.getByText("Delete my message", { exact: true })).toHaveCount(0);
});

test("Voice recording has live controls, locked draft, preview and inline playback", async ({ page }) => {
    await fixture(page);
    await page.addInitScript(() => {
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => ({ getTracks: () => [{ stop() {} }] }) });
        window.MediaRecorder = class {
            state = "inactive"; mimeType = "audio/webm"; stream: MediaStream;
            ondataavailable = (_event: { data: Blob }) => {}; onstop = () => {};
            constructor(stream: MediaStream) { this.stream = stream; }
            start() { this.state = "recording"; }
            stop() { this.state = "inactive"; this.ondataavailable({ data: new Blob(["audio"]) }); this.onstop(); }
        } as unknown as typeof MediaRecorder;
        window.AudioContext = class {
            createAnalyser() { return { fftSize: 256, getByteTimeDomainData(bytes: Uint8Array) { bytes.fill(180); } }; }
            createMediaStreamSource() { return { connect() {} }; }
            decodeAudioData() { return Promise.resolve({ length: 8000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(8000) }); }
            close() { return Promise.resolve(); }
        } as unknown as typeof AudioContext;
    });
    await page.route("http://uploads.trainflow.invalid/**", route => route.fulfill({ status: 200, body: "", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } }));
    await page.goto(`/app/messages?conversation=${chat}`);
    const input = page.getByRole("textbox", { name: "Message", exact: true });
    await page.getByRole("button", { name: "Record voice message" }).click();
    // The recorder takes the place of the text field while it runs.
    await expect(input).toHaveCount(0);
    await expect(page.getByLabel("Live audio waveform")).toBeVisible();
    await expect(page.getByText("0:01", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel recording" }).click();
    await expect(input).toBeEnabled();
    await page.getByRole("button", { name: "Record voice message" }).click();
    await page.getByRole("button", { name: "Stop recording" }).click();
    await expect(page.getByLabel("Preview voice message")).toBeVisible();
    await expect(input).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Record voice message" })).toHaveCount(0);
    await page.screenshot({ path: `../../.local/messaging/voice-ready-${test.info().project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel("Message history").getByLabel("Voice message", { exact: true })).toBeVisible();
    const playback = page.getByLabel("Message history").getByLabel("Voice message", { exact: true }).locator("audio");
    await expect.poll(() => playback.evaluate(element => (element as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(1);
    await playback.evaluate(element => (element as HTMLAudioElement).play());
    await expect.poll(() => playback.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
    await expect(input).toBeEnabled();
    await expect(page.getByLabel("Preview voice message")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
});


test("Reading a conversation does not resurrect its notification on Blocked", async ({ page }) => {
    await fixture(page);
    let read = false;
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    await page.route("**/api/v1/me/notifications/unread-count*", route => route.fulfill({ json: { count: read || new URL(route.request().url()).searchParams.has("activeConversation") ? 0 : 1 }, headers }));
    await page.route("**/messaging/conversations/*/read", async route => { if (route.request().method() === "POST") read = true; await route.fallback(); });
    await page.goto("/app/my-invitations");
    await expect(page.getByRole("button", { name: "Notifications, 1 unread", exact: true })).toBeVisible();
    await page.goto(`/app/messages?conversation=${chat}`);
    await expect.poll(() => read).toBe(true);
    const backToChats = page.getByRole("button", { name: "Back to conversations", exact: true });
    if (await backToChats.isVisible()) await backToChats.click();
    await page.getByRole("radio", { name: /^Blocked/ }).click();
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});


test("Sent images sit outside the bubble at the right edge even with a wider caption", async ({ page }) => {
    await fixture(page);
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    await page.route(`**/messaging/conversations/${chat}/messages*`, route => route.fulfill({ headers, json: { items: [{ id: "image-message", conversationId: chat, senderUserId: me, type: "File", body: "A longer caption than the attached image", createdAt: now, replyToMessageId: null, deletedAt: null, attachments: [{ mediaId: "photo", contentType: "image/png", size: 70 }] }], olderCursor: null } }));
    await page.route("**/messages/image-message/attachments/photo", route => route.fulfill({ headers, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") }));
    await page.goto(`/app/messages?conversation=${chat}`);
    const image = page.getByRole("img", { name: "Shared image", exact: true });
    await expect(image).toBeVisible();
    const article = page.getByRole("article").filter({ has: image });
    await article.hover();
    const menuBox = (await article.getByRole("button", { name: "Message options", exact: true }).boundingBox())!;
    const imageBox = (await image.boundingBox())!;
    expect(Math.abs(imageBox.x - menuBox.x - menuBox.width)).toBeLessThan(8);
    const rowBox = (await article.boundingBox())!;
    expect(Math.abs(imageBox.x + imageBox.width - rowBox.x - rowBox.width)).toBeLessThan(2);
    expect(await image.evaluate(element => [...element.parentElement!.parentElement!.parentElement!.children].filter(child => child.contains(element)).every(child => !child.className.includes("bubble")))).toBe(true);
    await expect(page.getByRole("button", { name: "Open image", exact: true })).toHaveCSS("cursor", "default");
});


test("Chat coaching shares commit once on the server and preserve drafts on retry", async ({ page }) => {
    const writes = await fixture(page);
    const offerId = "00000000-0000-4000-8000-000000000003";
    const invitationId = "00000000-0000-4000-8000-000000000004";
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    const entries: unknown[] = [];
    const keys: string[] = [];
    let failed = false;
    await page.route("**/api/v1/offers?*", route => route.fulfill({ headers, json: { items: [{ id: offerId, coachId: me, name: "Personal coaching", status: "Active" }], total: 1, page: 1, pageSize: 100 } }));
    await page.route("**/api/v1/coaching/{invitations,form-shares}", route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ headers, status: 204 });
        const invitation = route.request().url().endsWith("invitations");
        if (invitation) {
            keys.push(route.request().headers()["idempotency-key"]!);
            if (!failed) { failed = true; return route.fulfill({ headers, status: 503, json: { detail: "Temporary send failure" } }); }
        }
        entries.push({ id: `entry-${entries.length}`, conversationId: chat, senderUserId: me, type: "System", body: null, attachments: [], createdAt: now, coachingEntry: { kind: invitation ? "Invitation" : "OfferForm", invitationId: invitation ? invitationId : null, offerId, coachId: me, title: "Personal coaching" } });
        return route.fulfill({ headers, json: { id: invitationId, conversationId: chat, messageId: "entry" } });
    });
    await page.route(`**/conversations/${chat}/messages*`, route => route.request().method() === "GET" ? route.fulfill({ headers, json: { items: entries, olderCursor: null } }) : route.fallback());
    await page.goto(`/app/messages?conversation=${chat}`);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Keep my draft");
    await page.getByRole("button", { name: "More message options" }).click();
    await page.getByRole("menuitem", { name: "Send application form" }).click();
    await page.getByRole("dialog", { name: "Send application form", exact: true }).getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open application form" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Keep my draft");
    await page.getByRole("button", { name: "More message options" }).click();
    await page.getByRole("menuitem", { name: "Send invitation", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Send invitation", exact: true });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Temporary send failure");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "View invitation" })).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(writes.filter(w => w.path.endsWith("/messages"))).toHaveLength(0);
});

test("Chat coaching actions explain missing offers and honor feature access", async ({ page }) => {
    await fixture(page);
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    await page.route("**/api/v1/offers?*", route => route.fulfill({ headers, json: { items: [], total: 0, page: 1, pageSize: 100 } }));
    await page.goto(`/app/messages?conversation=${chat}`);
    await page.getByRole("button", { name: "More message options" }).click();
    await page.getByRole("menuitem", { name: "Send application form" }).click();
    await expect(page.getByRole("dialog", { name: "Send application form", exact: true })).toContainText("Activate an offer");
    await expect(page.getByRole("dialog", { name: "Send application form", exact: true }).getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await page.getByRole("dialog", { name: "Send application form", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.route("**/api/v1/me/access", route => route.fulfill({ headers, json: { version: "denied", features: features.map((f: { key: string }) => ({ key: f.key, available: f.key !== "coaching.invitations.send", reason: f.key === "coaching.invitations.send" ? "not_granted" : "available" })), limits: [] } }));
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "More message options" })).toHaveCount(0);
});

test("Pending sender keeps a disabled composer in the normal inbox", async ({ page }) => {
    const writes = await fixture(page, { pending: "outgoing" });
    await page.goto("/app/messages");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Attach files" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Requests/ })).toHaveCount(0);
    expect(writes.filter(write => write.path.endsWith("/messages"))).toHaveLength(0);
});

test("Message privacy is opt-in and persists independently of chat navigation", async ({ page }) => {
    await fixture(page);
    await page.goto("/app/settings");
    const preference = page.getByRole("checkbox", { name: "Require approval for new conversations" });
    await expect(preference).not.toBeChecked();
    await page.getByText("Require approval for new conversations", { exact: true }).click();
    await expect(preference).toBeChecked();
    await page.goto("/app/messages");
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
    await page.goto("/app/settings");
    await expect(preference).toBeChecked();
});
