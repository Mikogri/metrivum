import { useQuery } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { DETAIL_GROUPS, detailsFromValues, type DetailKey } from "../components/ProfileDetails";
import { profileFieldsKey } from "./people";
import { useProfile } from "./useProfile";

export type CompletenessItem = { id: string; done: boolean; href: string };

/** How much of the profile is filled in: the introduction and each detail group, with where to finish them. */
export function useProfileCompleteness(): { items: CompletenessItem[]; done: number; percent: number; pending: boolean } {
  const profile = useProfile();
  const api = useApi();
  const account = useAccountKey();
  const fields = useQuery({
    queryKey: profileFieldsKey(account),
    queryFn: async ({ signal }) => (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields", signal })).data,
  });
  const details = detailsFromValues(fields.data?.values as Record<string, unknown> | undefined);
  const filled = (key: DetailKey) => {
    const value = details[key];
    return typeof value === "number" ? !Number.isNaN(value) : Array.isArray(value) ? value.length > 0 : value.trim() !== "";
  };
  const items: CompletenessItem[] = [
    { id: "bio", done: Boolean(profile.bio?.trim()), href: "/app/profile" },
    ...(Object.keys(DETAIL_GROUPS) as (keyof typeof DETAIL_GROUPS)[]).map((group) => ({ id: group, done: DETAIL_GROUPS[group].some(filled), href: "/app/settings?section=body" })),
  ];
  const done = items.filter((item) => item.done).length;
  return { items, done, percent: Math.round((done / items.length) * 100), pending: fields.isPending };
}
