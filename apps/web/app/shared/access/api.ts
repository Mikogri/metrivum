import type { AccessSnapshot } from "@trainflow/api-client-web";
import type { Transport } from "~/shared/http/transport";

export async function getAccess(api: Transport, signal?: AbortSignal) {
  return (await api<AccessSnapshot>({ path: "/api/v1/me/access", signal })).data;
}
