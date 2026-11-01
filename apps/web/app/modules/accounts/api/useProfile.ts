import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { ProfileResponse } from "@metrivum/api-client-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getMe } from "./profile";

export const profileKey = (accountKey: string) => [accountKey, "me"] as const;

export function useProfileQuery() {
  const api = useApi();
  const accountKey = useAccountKey();
  return useQuery({ queryKey: profileKey(accountKey), queryFn: ({ signal }) => getMe(api, signal), staleTime: 5 * 60_000 });
}

export const ProfileContext = createContext<ProfileResponse | null>(null);

/** The onboarded profile of the active account. Available inside the app shell. */
export function useProfile(): ProfileResponse {
  const profile = useContext(ProfileContext);
  if (!profile) throw new Error("useProfile must be used inside <AccountGate>.");
  return profile;
}
