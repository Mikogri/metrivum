import type {
  OnboardingRequest,
  ProfileResponse,
  UpdateProfileRequest,
} from "@metrivum/api-client-web";
import { ApiError } from "~/shared/http/errors";
import type { Transport } from "~/shared/http/transport";

export async function getMe(api: Transport, signal?: AbortSignal) {
  return (await api<ProfileResponse>({ path: "/api/v1/me", signal })).data;
}

/** Whether nobody else has this username yet (onboarding asks before leaving the first step). */
export async function usernameAvailable(
  api: Transport,
  username: string,
): Promise<boolean> {
  try {
    return (
      await api<{ available: boolean }>({
        path: "/api/v1/me/username-availability",
        query: { username },
      })
    ).data.available;
  } catch (error) {
    // An API without that route yet: a public profile under the name means it is taken.
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    try {
      await api({
        path: `/api/v1/accounts/people/${encodeURIComponent(username)}`,
      });
      return false;
    } catch (lookup) {
      if (lookup instanceof ApiError && lookup.status === 404) return true;
      throw lookup;
    }
  }
}

export async function completeOnboarding(
  api: Transport,
  body: OnboardingRequest,
) {
  return (
    await api<ProfileResponse>({
      method: "PUT",
      path: "/api/v1/me/onboarding",
      json: body,
    })
  ).data;
}

export async function updateProfile(
  api: Transport,
  body: UpdateProfileRequest,
  version: number,
) {
  return (
    await api<ProfileResponse>({
      method: "PATCH",
      path: "/api/v1/me",
      json: body,
      ifMatch: version,
    })
  ).data;
}
