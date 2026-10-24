import type { Schema } from "@trainflow/api-client-web";
import type { Transport } from "~/shared/http/transport";

export type Person = Schema<"PersonProfileResponse">;

export const personKey = (accountKey: string, username: string) => [accountKey, "person", username.toLowerCase()] as const;
/** The signed-in person's own body and training details (private). */
export const profileFieldsKey = (accountKey: string) => [accountKey, "me", "profile-fields"] as const;

/** A public profile by exact username. Unknown and inactive accounts answer 404. */
export async function getPerson(api: Transport, username: string, signal?: AbortSignal) {
  return (await api<Person>({ path: `/api/v1/accounts/people/${encodeURIComponent(username.replace(/^@/, ""))}`, signal })).data;
}
