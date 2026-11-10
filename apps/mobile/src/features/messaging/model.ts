export function mergeMessages<T extends { id: string; createdAt: string }>(
  ...pages: T[][]
): T[] {
  return [
    ...new Map(pages.flat().map((message) => [message.id, message])).values(),
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

export function wasRead(
  messageId: string,
  orderedIds: string[],
  marker?: string | null,
): boolean {
  const index = orderedIds.indexOf(messageId);
  return index >= 0 && orderedIds.indexOf(marker ?? "") >= index;
}

type ReadSummary = {
  unreadCount: number;
  lastMessage: { id: string } | null;
  members: { userId: string; lastReadMessageId: string | null }[];
};
type ReadMessage = { id: string; senderUserId: string };

export function optimisticRead<T extends ReadSummary>(
  conversation: T,
  messages: ReadMessage[],
  target: string,
  actor: string,
): T {
  const index = messages.findIndex((message) => message.id === target);
  const own = conversation.members.find((member) => member.userId === actor);
  if (
    index < 0 ||
    !own ||
    messages.findIndex((message) => message.id === own.lastReadMessageId) >=
      index
  )
    return conversation;
  // Only the loaded latest page proves how many incoming messages remain unread.
  const latestKnown = conversation.lastMessage?.id === messages.at(-1)?.id;
  return {
    ...conversation,
    unreadCount: latestKnown
      ? Math.min(
          conversation.unreadCount,
          messages
            .slice(index + 1)
            .filter((message) => message.senderUserId !== actor).length,
        )
      : conversation.unreadCount,
    members: conversation.members.map((member) =>
      member.userId === actor
        ? { ...member, lastReadMessageId: target }
        : member,
    ),
  };
}

export function rollbackRead<T extends ReadSummary>(
  current: T,
  before: T,
  target: string,
  actor: string,
): T {
  if (
    current.members.find((member) => member.userId === actor)
      ?.lastReadMessageId !== target
  )
    return current;
  return {
    ...current,
    unreadCount: Math.max(current.unreadCount, before.unreadCount),
    members: current.members.map((member) =>
      member.userId === actor
        ? {
            ...member,
            lastReadMessageId:
              before.members.find((previous) => previous.userId === actor)
                ?.lastReadMessageId ?? null,
          }
        : member,
    ),
  };
}

export function validateImageBounds(
  size: number,
  dimensions?: { width: number; height: number },
) {
  if (!Number.isFinite(size) || size < 0 || size > 5 * 1024 * 1024)
    throw new Error("Image exceeds the mobile 5 MB limit.");
  if (
    dimensions &&
    (!Number.isFinite(dimensions.width) ||
      !Number.isFinite(dimensions.height) ||
      dimensions.width <= 0 ||
      dimensions.height <= 0 ||
      dimensions.width > 10000 ||
      dimensions.height > 10000 ||
      dimensions.width * dimensions.height > 24000000)
  )
    throw new Error("Image dimensions exceed the mobile display limit.");
}

export interface ComposerDraft {
  body: string;
  replyToMessageId: string | null;
  mediaId: string | null;
  mediaType?: "File" | "VoiceMessage";
  idempotencyKey: string;
  attempted: boolean;
}
