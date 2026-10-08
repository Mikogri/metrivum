import { describe, expect, it } from "vitest";
import { mergeMessages, messageKind, messageWasRead } from "./model";
import type { Schema } from "@trainflow/api-client-web";
const msg = (id: string, createdAt: string): Schema<"MessageDto"> => ({
    id,
    createdAt,
    conversationId: "chat",
    senderUserId: "person",
    type: "Text",
    body: id,
    replyToMessageId: null,
    cursor: id,
    attachments: [],
});
describe("message history", () => {
    it("deduplicates realtime and catch-up without losing microsecond order", () => {
        const a = msg("z", "2026-10-07T10:00:00.000001Z");
        const b = msg("a", "2026-10-07T10:00:00.000002Z");
        expect(mergeMessages([b, a], [a]).map((x) => x.id)).toEqual(["z", "a"]);
        expect(
            mergeMessages([a, msg("zero", "2026-10-07T10:00:00Z")]).map(
                (x) => x.id,
            ),
        ).toEqual(["zero", "z"]);
    });
    it("requires one attachment type per message and accepts supported WAV voice", () => {
        expect(messageKind([])).toBe("Text");
        expect(
            messageKind([new File([], "voice.wav", { type: "audio/wav" })]),
        ).toBe("VoiceMessage");
        expect(() =>
            messageKind([
                new File([], "a.png", { type: "image/png" }),
                new File([], "b.pdf", { type: "application/pdf" }),
            ]),
        ).toThrow();
        expect(() =>
            messageKind([new File([], "voice.webm", { type: "audio/webm" })]),
        ).toThrow();
    });
});

it("marks every own message up to the peer's read marker, not just the last one", () => {
    const messages = [msg("one", "2026-10-08T10:00:00Z"), msg("two", "2026-10-08T10:00:01Z"), msg("three", "2026-10-08T10:00:02Z")];
    expect(messages.map(message => messageWasRead(message, messages, "two"))).toEqual([true, true, false]);
    expect(messageWasRead(messages[0]!, messages, null)).toBe(false);
});
