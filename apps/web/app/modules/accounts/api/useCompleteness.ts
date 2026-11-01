import { useQuery } from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
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
  // Coaches also need something to sell: the first offer (draft or published) counts.
  const coach = profile.roles.includes("Coach");
  const offers = useQuery({
    queryKey: [account, "coaching", "completeness", "offers"],
    queryFn: async ({ signal }) => (await api<{ items: unknown[] }>({ path: "/api/v1/offers?page=1&pageSize=1", signal })).data,
    enabled: coach,
  });
  const details = detailsFromValues(fields.data?.values as Record<string, unknown> | undefined);
  const filled = (key: DetailKey) => {
    const value = details[key];
    return typeof value === "number" ? !Number.isNaN(value) : Array.isArray(value) ? value.length > 0 : value.trim() !== "";
  };
  const items: CompletenessItem[] = [
    { id: "bio", done: Boolean(profile.bio?.trim()), href: "/app/profile" },
    ...(Object.keys(DETAIL_GROUPS) as (keyof typeof DETAIL_GROUPS)[]).map((group) => ({ id: group, done: DETAIL_GROUPS[group].some(filled), href: "/app/settings?section=body" })),
    ...(coach ? [{ id: "offer", done: (offers.data?.items.length ?? 0) > 0, href: "/app/offers/new" }] : []),
  ];
  const done = items.filter((item) => item.done).length;
  return { items, done, percent: Math.round((done / items.length) * 100), pending: fields.isPending || (coach && offers.isPending) };
}
