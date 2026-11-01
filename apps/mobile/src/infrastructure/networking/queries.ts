import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    ApiRequest,
    QueryValue,
} from "@metrivum/api-client-web/transport";
import { useMobile } from "../session/MobileSession";
import { useToast } from "@metrivum/ui-mobile";

export function useApiQuery<T>(
    path: string,
    query?: Record<string, QueryValue>,
    enabled = true,
) {
    const { api, accountId, role } = useMobile();
    // Account-level data (`/me/...`) is the same in both views, so it survives a view switch.
    const scope = path.startsWith("/api/v1/me/") ? "account" : role;
    return useQuery({
        queryKey: [accountId, scope, path, query],
        enabled,
        queryFn: async ({ signal }) =>
            (await api<T>({ path, query, signal })).data,
    });
}
export function useApiMutation<T = unknown>(
    onSuccess?: (data: T) => void | Promise<void>,
    options?: { invalidatePaths?: readonly string[]; successMessage?: string | false },
) {
    const { api, accountSignal, accountId } = useMobile();
    const cache = useQueryClient();
    const toast = useToast();
    return useMutation({
        mutationFn: async (request: ApiRequest) => (await api<T>(request)).data,
        onSuccess: async (data, request) => {
            if (accountSignal.aborted) return;
            await onSuccess?.(data);
            if (accountSignal.aborted) return;
            // Chat writes affect chat and unread state; they do not change finance/training reports.
            const chatMutation = request.path.startsWith("/api/v1/messaging/");
            const paths = options?.invalidatePaths ?? (chatMutation
                ? ["/api/v1/messaging", "/api/v1/me/notifications"] : undefined);
            void cache.invalidateQueries({ predicate: (query) => query.queryKey[0] === accountId && (!paths
                || chatMutation && query.queryKey[1] === "mobile-messages"
                || typeof query.queryKey[2] === "string" && paths.some((path) => query.queryKey[2] === path
                    || (query.queryKey[2] as string).startsWith(path + "/"))) });
            if (options?.successMessage === false) return;
            toast(options?.successMessage ?? "Saved");
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        },
        onError: (error) => {
            if (accountSignal.aborted) return;
            toast(
                error instanceof Error
                    ? error.message
                    : "Unable to save changes.",
                true,
            );
        },
    });
}
