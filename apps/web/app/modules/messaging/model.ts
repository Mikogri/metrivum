import type { Schema } from "@metrivum/api-client-web";
export type Conversation = Schema<"ConversationDto">;
export type Message = Schema<"MessageDto">;
// Reconnect/events invalidate history; offline polling also recovers deletions on older pages.
export const historyPollingInterval = (status: string) => status === "Live" ? false : 15000;
export type Request = Schema<"RequestDto">;
export type LocalOutgoing = { body: string; status: "Sending…" | "Not sent — retry below"; clientMessageId?: string };

export function messageWasRead(message: Message, history: Message[], readId?: string | null): boolean {
    const marker = history.findIndex(item => item.id === readId);
    const index = history.findIndex(item => item.id === message.id);
    return index >= 0 && marker >= index;
}
export function mergeMessages(...pages: Message[][]): Message[] {
    return [
        ...new Map(
            pages.flat().map((message) => [message.id, message]),
        ).values(),
    ].sort(
        (a, b) =>
            Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
            (a.createdAt.match(/\.(\d+)/)?.[1] ?? "")
                .padEnd(7, "0")
                .localeCompare(
                    (b.createdAt.match(/\.(\d+)/)?.[1] ?? "").padEnd(7, "0"),
                ) ||
            a.id.localeCompare(b.id),
    );
}
export function messageKind(files: File[]): Message["type"] {
    const types = files.map((file) =>
        file.type.startsWith("image/")
            ? "Image"
            : file.type.startsWith("video/")
              ? "Video"
              : file.type.startsWith("audio/")
                ? "VoiceMessage"
                : "File",
    );
    if (new Set(types).size > 1)
        throw new Error(
            "Send images, documents, videos and voice recordings in separate messages.",
        );
    if (
        types[0] === "VoiceMessage" &&
        (files.length !== 1 || files[0]?.type !== "audio/wav")
    )
        throw new Error(
            "Choose one PCM WAV recording for a voice message (up to five minutes).",
        );
    if (
        files.length > 10 ||
        files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024 ||
        files.some((f) => f.size > 50 * 1024 * 1024)
    )
        throw new Error(
            "Use up to 10 files, 50 MB per file and 100 MB per message.",
        );
    return types[0] ?? "Text";
}
