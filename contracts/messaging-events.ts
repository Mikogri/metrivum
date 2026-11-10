import type { components } from "./generated/api";

// SignalR JSON payloads. REST remains authoritative after reconnect or missed events.
export interface MessagingServerEvents {
  MessageDeleted: (message: components["schemas"]["MessageDto"]) => void;
  MessageCreated: (message: components["schemas"]["MessageDto"]) => void;
  ConversationUpdated: (event: { conversationId: string }) => void;
  MembershipChanged: (event: {
    conversationId: string;
    userId?: string;
  }) => void;
  ReadMarkerChanged: (event: {
    conversationId: string;
    userId: string;
  }) => void;
  MessageRequestCreated: (request: components["schemas"]["RequestDto"]) => void;
  MessageRequestUpdated: (request: components["schemas"]["RequestDto"]) => void;
  TypingChanged: (event: {
    conversationId: string;
    userId: string;
    typing: boolean;
    expiresAt: string;
  }) => void;
}

export interface MessagingClientMethods {
  Subscribe(conversationId: string): Promise<void>;
  Typing(conversationId: string, typing: boolean): Promise<void>;
}
