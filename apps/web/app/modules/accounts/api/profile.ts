import type { OnboardingRequest, ProfileResponse, UpdateProfileRequest } from "@trainflow/api-client-web";
import type { Transport } from "~/shared/http/transport";

export async function getMe(api: Transport, signal?: AbortSignal) {
  return (await api<ProfileResponse>({ path: "/api/v1/me", signal })).data;
}

export async function completeOnboarding(api: Transport, body: OnboardingRequest) {
  return (await api<ProfileResponse>({ method: "PUT", path: "/api/v1/me/onboarding", json: body })).data;
}

export async function updateProfile(api: Transport, body: UpdateProfileRequest, version: number) {
  return (await api<ProfileResponse>({ method: "PATCH", path: "/api/v1/me", json: body, ifMatch: version })).data;
}
