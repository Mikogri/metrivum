import type { Schema } from "@trainflow/api-client-web";
import type { Conversation, Request } from "./model";

export type NotificationItem = { id: string; title: string; preview: string; href: string; count: number; createdAt: string; invitation?: boolean };
export function notificationItems(conversations: Conversation[], requests: Request[], invitations: Schema<"InvitationDto">[], userId: string, activeConversation: string | null = null): NotificationItem[] {
  // Unexpected shapes (an outdated API or a test double) mean no notifications rather than a crashed shell.
  const list = <T,>(value: T[]): T[] => (Array.isArray(value) ? value : []);
  conversations = list(conversations);
  requests = list(requests);
  invitations = list(invitations);
  return [
    ...conversations.filter(c => c.id !== activeConversation && Number(c.unreadCount) > 0).map(c => ({ id: `chat:${c.id}`, title: c.title, preview: c.lastMessage?.body || c.lastMessage?.type || "New message", href: `/app/messages?conversation=${c.id}`, count: Number(c.unreadCount), createdAt: c.lastMessage?.createdAt || "" })),
    ...requests.filter(r => r.recipientUserId === userId && r.state === "Pending").map(r => ({ id: `request:${r.id}`, title: r.senderDisplayName || "Message request", preview: r.body, href: "/app/messages?tab=requests", count: 1, createdAt: r.createdAt })),
    ...invitations.filter(i => i.targetUserId === userId && i.status === "Pending").map(i => ({ id: `invitation:${i.id}`, title: i.coach.displayName, preview: i.message || `Invitation: ${i.offerRevision.name}`, href: `/app/invitations/${i.id}`, count: 1, createdAt: i.createdAt, invitation: true })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
