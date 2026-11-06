import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
import type { ApiRequest, QueryValue } from "~/shared/http";
import { useAccountContext } from "~/shared/session/AccountScope";

export const grants = {
  read_training: "Read training programs and exercises",
  write_training_drafts: "Create and edit private training drafts",
  assign_programs: "Assign published programs to one client after your approval",
  read_clients: "Read your clients, coaching applications and offers",
  read_checkins: "Read check-ins and submitted answers",
  manage_checkins: "Create private check-in form drafts",
  read_messages: "Read conversations and messages",
  prepare_messages: "Prepare messages for your review",
  send_approved_messages: "Send messages you explicitly approve in Metrivum",
  read_finances: "Read business financial analytics",
  read_calendar: "Read your calendar and meetings",
} as const;
export type Connection = Schema<"ConnectionDto">;
export type Action = Schema<"PendingActionDto">;
export type Activity = Schema<"IntegrationActivityDto">;
export type Preferences = Schema<"PreferencesDto">;
export type ConsentDetails = Schema<"ConsentDetails">;
export const grantLabel = (grant: string) => grants[grant as keyof typeof grants] ?? grant;

export function useIntegrationQuery<T>(path: string, query?: Record<string, QueryValue>, enabled = true) {
  const { api, accountKey } = useAccountContext();
  return useQuery({ queryKey: [accountKey, "integrations", path, query], enabled, staleTime: 30_000, refetchOnWindowFocus: true, queryFn: async ({ signal }) => (await api<T>({ path, query, signal })).data });
}
export function useIntegrationMutation<T>(onSuccess?: (data: T) => void) {
  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  return useMutation({ mutationFn: async (request: ApiRequest) => (await api<T>({ ...request, signal: lifecycle.signal() })).data,
    onSuccess: (data) => {
      if (!lifecycle.isCurrent()) return;
      onSuccess?.(data);
      void cache.invalidateQueries({ queryKey: [accountKey, "integrations"] });
    } });
}

// The API exposes consent, not external token validity or provider connectivity.
export function connectionStatus(connection: Connection) {
  return connection.revokedAt ? "revoked" : connection.grants.length ? "active" : "attention";
}
