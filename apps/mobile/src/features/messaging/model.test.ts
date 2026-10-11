import { describe, expect, it } from "vitest";
import {
    mergeMessages,
    wasRead,
    optimisticRead,
    rollbackRead,
    validateImageBounds,
} from "./model";

describe("message history reconciliation", () => {
    const message = (id: string, createdAt: string, body = id) => ({
        id,
        createdAt,
        body,
    });
    it("deduplicates refreshed pages and orders sub-millisecond server timestamps", () => {
        const early = message("z", "2026-10-10T10:00:00.0000001Z");
        const late = message("a", "2026-10-10T10:00:00.0000002Z");
        expect(
            mergeMessages([late, early], [{ ...early, body: "deleted" }]),
        ).toEqual([{ ...early, body: "deleted" }, late]);
    });
    it("does not mark unknown read markers as read", () => {
        expect(wasRead("a", ["a", "b"], "missing")).toBe(false);
        expect(wasRead("a", ["a", "b"], "b")).toBe(true);
        expect(wasRead("b", ["a", "b"], "a")).toBe(false);
    });
});

describe("optimistic conversation reads", () => {
    const messages = [
        { id: "a", senderUserId: "other" },
        { id: "b", senderUserId: "me" },
        { id: "c", senderUserId: "other" },
    ];
    const before = {
        unreadCount: 2,
        lastMessage: { id: "c" },
        members: [{ userId: "me", lastReadMessageId: null as string | null }],
    };
    it("keeps newer incoming messages unread and does not regress markers", () => {
        const next = optimisticRead(before, messages, "a", "me");
        expect(next.unreadCount).toBe(1);
        expect(
            optimisticRead(
                optimisticRead(before, messages, "c", "me"),
                messages,
                "a",
                "me",
            ).unreadCount,
        ).toBe(0);
        expect(before.unreadCount).toBe(2);
    });
    it("does not guess the unread count when the latest message is outside the loaded page", () => {
        expect(
            optimisticRead(
                { ...before, lastMessage: { id: "new" } },
                messages,
                "c",
                "me",
            ).unreadCount,
        ).toBe(2);
    });
    it("rolls back the marker without replacing a newer message or read acknowledgement", () => {
        const next = optimisticRead(before, messages, "a", "me");
        expect(
            rollbackRead(
                { ...next, lastMessage: { id: "new" } },
                before,
                "a",
                "me",
            ),
        ).toEqual({ ...before, lastMessage: { id: "new" } });
        const newer = optimisticRead(next, messages, "c", "me");
        expect(rollbackRead(newer, before, "a", "me")).toBe(newer);
    });
});

it("bounds private inline images by bytes and decoded pixel dimensions", () => {
    expect(() =>
        validateImageBounds(5 * 1024 * 1024, { width: 6000, height: 4000 }),
    ).not.toThrow();
    expect(() => validateImageBounds(5 * 1024 * 1024 + 1)).toThrow();
    expect(() =>
        validateImageBounds(1024, { width: 6000, height: 4001 }),
    ).toThrow();
    expect(() => validateImageBounds(1024, { width: 0, height: 10 })).toThrow();
});
