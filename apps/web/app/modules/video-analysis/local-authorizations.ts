import type { Transport } from "~/shared/http/transport";

const storageKey = (account: string) =>
  `trainflow.analyzer.authorizations:${account}`;
type Permit = string | { id?: string; teamId?: string };
const memory = new Map<string, Record<string, Permit>>();
function read(account: string): Record<string, Permit> {
  try {
    return JSON.parse(
      localStorage.getItem(storageKey(account)) ?? "{}",
    ) as Record<string, Permit>;
  } catch {
    return memory.get(account) ?? {};
  }
}
function write(account: string, value: Record<string, Permit>) {
  memory.set(account, value);
  try {
    localStorage.setItem(storageKey(account), JSON.stringify(value));
  } catch {
    /* Private browsing keeps permits for this page; the server expires abandoned reservations. */
  }
}
export const jobAuthorization = (account: string, jobId: string) => {
  const permit = read(account)[jobId];
  return typeof permit === "string" ? permit : permit?.id;
};
export const jobAuthorizationTeam = (account: string, jobId: string) => {
  const permit = read(account)[jobId];
  return typeof permit === "string" ? undefined : permit?.teamId;
};
export function forgetJobAuthorization(account: string, jobId: string) {
  const value = read(account);
  delete value[jobId];
  write(account, value);
}

/** Reserve online before starting local work. The companion's job ID remains independent of the permit ID. */
export async function authorizeLocalJob<T extends { id: string }>(
  api: Transport,
  account: string,
  durationSeconds: number,
  start: () => Promise<T>,
  signal: AbortSignal,
  isCurrent: () => boolean,
  teamId?: string,
): Promise<T> {
  signal.throwIfAborted();
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("The analyzed video duration is invalid.");
  const permit = crypto.randomUUID();
  let reserved = false;
  try {
    await api({
      method: "POST",
      path: "/api/v1/analyses/local-authorizations",
      json: {
        localAnalysisId: permit,
        durationSeconds,
        ...(teamId ? { teamId } : {}),
      },
      signal,
    });
    reserved = true;
    signal.throwIfAborted();
    if (!isCurrent())
      throw new DOMException("The account changed.", "AbortError");
    const job = await start();
    signal.throwIfAborted();
    if (!isCurrent())
      throw new DOMException("The account changed.", "AbortError");
    write(account, { ...read(account), [job.id]: { id: permit, teamId } });
    return job;
  } catch (failure) {
    // Cleanup may outlive a page operation, but never the account that owns the transport.
    if (reserved && isCurrent())
      await api({
        method: "DELETE",
        path: `/api/v1/analyses/local-authorizations/${permit}`,
      }).catch(() => {});
    throw failure;
  }
}

/** Only forget a failed permit after the server acknowledged its release; polling can retry a transient failure. */
export async function releaseJobAuthorization(
  api: Transport,
  account: string,
  jobId: string,
  signal: AbortSignal,
) {
  const permit = jobAuthorization(account, jobId);
  if (!permit) return;
  await api({
    method: "DELETE",
    path: `/api/v1/analyses/local-authorizations/${permit}`,
    signal,
  });
  signal.throwIfAborted();
  const teamId = jobAuthorizationTeam(account, jobId);
  if (teamId) write(account, { ...read(account), [jobId]: { teamId } });
  else forgetJobAuthorization(account, jobId);
}
