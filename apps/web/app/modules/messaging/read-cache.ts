import type { QueryClient } from "@tanstack/react-query";
import type { Conversation } from "./model";

import { journalRead } from "./read-journal";

const root = "/api/v1/messaging/conversations";

/** Update every search variant and the open conversation; rollback only our own marker. */
export function optimisticRead(cache: QueryClient, account: string, id: string, user: string, message: string) {
  const snapshots = cache.getQueriesData<Conversation | Conversation[]>({
    predicate: query => query.queryKey[0] === account && query.queryKey[1] === "messaging"
      && (query.queryKey[2] === root || query.queryKey[2] === `${root}/${id}`),
  });
  const update = (c: Conversation): Conversation => c.id !== id ? c : {
    ...c, unreadCount: 0,
    members: c.members.map(member => member.userId === user ? { ...member, lastReadMessageId: message } : member),
  };
  return journalRead<Conversation | Conversation[]>(cache, snapshots.map(([key]) => ({
    key, apply: value => Array.isArray(value) ? value.map(update) : update(value),
  })));
}
