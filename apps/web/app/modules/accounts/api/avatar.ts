import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileResponse, Schema } from "@metrivum/api-client-web";
import { mockFetch } from "~/shared/dev/mockApi";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { profileKey } from "./useProfile";

export const AVATAR_TYPES = "image/png,image/jpeg,image/webp";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const avatarKey = (accountKey: string, userId: string) =>
  [accountKey, "avatar", userId] as const;

/** A short-lived link to someone's profile photo, or nothing when they have none (a removed photo's old link is never returned). */
export function useAvatarUrl(
  userId: string | undefined,
  hasAvatar: boolean | undefined,
): string | undefined {
  const api = useApi();
  const account = useAccountKey();
  const link = useQuery({
    queryKey: avatarKey(account, userId ?? ""),
    queryFn: async () =>
      (
        await api<Schema<"DocumentReadUrl">>({
          method: "POST",
          path: `/api/v1/accounts/people/${userId}/avatar/read-url`,
        })
      ).data.url,
    enabled: Boolean(userId && hasAvatar),
    staleTime: 60_000,
  });
  return userId && hasAvatar ? link.data : undefined;
}

/** Upload a new profile photo or remove the current one; the profile and its photo link refresh after either. */
export function useAvatarActions(
  invalidMessage: string,
  failedMessage: string,
) {
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const done = (profile: ProfileResponse) => {
    cache.setQueryData(profileKey(account), profile);
    void cache.invalidateQueries({ queryKey: avatarKey(account, profile.id) });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (
        !AVATAR_TYPES.split(",").includes(file.type) ||
        file.size > AVATAR_MAX_BYTES
      )
        throw new Error(invalidMessage);
      const ticket = (
        await api<Schema<"DocumentUpload">>({
          method: "POST",
          path: "/api/v1/me/avatar/uploads",
          json: { name: file.name, contentType: file.type, size: file.size },
        })
      ).data;
      const send = MOCK_MODE ? mockFetch : fetch;
      const sent = await send(ticket.uploadUrl, {
        method: ticket.method,
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
        credentials: "omit",
      });
      if (!sent.ok) throw new Error(failedMessage);
      return (
        await api<ProfileResponse>({
          method: "PUT",
          path: "/api/v1/me/avatar",
          json: { mediaId: ticket.mediaId },
        })
      ).data;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async () =>
      (
        await api<ProfileResponse>({
          method: "DELETE",
          path: "/api/v1/me/avatar",
        })
      ).data,
    onSuccess: done,
  });
  return { upload, remove };
}
