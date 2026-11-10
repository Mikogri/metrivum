import { beforeEach, expect, it, vi } from "vitest";
import type { Transport } from "~/shared/http/transport";
import {
  authorizeLocalJob,
  jobAuthorization,
  jobAuthorizationTeam,
  releaseJobAuthorization,
} from "./local-authorizations";

beforeEach(() => localStorage.clear());

it("reserves online before starting the companion and remembers the separate permit across reloads", async () => {
  const api = vi.fn().mockResolvedValue({ data: {} });
  const start = vi.fn(async () => {
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/analyses/local-authorizations",
        json: { localAnalysisId: expect.any(String), durationSeconds: 10 },
      }),
    );
    return { id: "companion-job" };
  });
  await authorizeLocalJob(
    api as Transport,
    "account-a",
    10,
    start,
    new AbortController().signal,
    () => true,
  );
  const permit = api.mock.calls[0]![0].json.localAnalysisId;
  expect(jobAuthorization("account-a", "companion-job")).toBe(permit);
  expect(jobAuthorization("account-b", "companion-job")).toBeUndefined();
  expect(
    localStorage.getItem("trainflow.analyzer.authorizations:account-a"),
  ).toContain(permit);
});

it("does not start when the API rejects a quota reservation", async () => {
  const api = vi.fn().mockRejectedValue(new Error("limit_exceeded"));
  const start = vi.fn();
  await expect(
    authorizeLocalJob(
      api as Transport,
      "account-a",
      10,
      start,
      new AbortController().signal,
      () => true,
    ),
  ).rejects.toThrow("limit_exceeded");
  expect(start).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(1);
});

it("releases a reservation when enqueueing fails without counting a successful run", async () => {
  const api = vi.fn().mockResolvedValue({ data: {} });
  await expect(
    authorizeLocalJob(
      api as Transport,
      "account-a",
      10,
      async () => {
        throw new Error("companion unavailable");
      },
      new AbortController().signal,
      () => true,
    ),
  ).rejects.toThrow("companion unavailable");
  expect(api.mock.calls[1]![0]).toMatchObject({
    method: "DELETE",
    path:
      "/api/v1/analyses/local-authorizations/" +
      api.mock.calls[0]![0].json.localAnalysisId,
  });
  expect(jobAuthorization("account-a", "missing")).toBeUndefined();
});

it("does not start or persist a permit after the originating account changes", async () => {
  let current = true;
  const api = vi.fn(async () => {
    current = false;
    return { data: {} };
  });
  const start = vi.fn();
  await expect(
    authorizeLocalJob(
      api as unknown as Transport,
      "account-a",
      10,
      start,
      new AbortController().signal,
      () => current,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(start).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(1);
});

it("releases failed jobs idempotently and retains the mapping when release fails", async () => {
  const api = vi.fn().mockResolvedValue({ data: {} });
  const signal = new AbortController().signal;
  await authorizeLocalJob(
    api as Transport,
    "account-a",
    10,
    async () => ({ id: "job" }),
    signal,
    () => true,
  );
  api.mockRejectedValueOnce(new Error("offline"));
  await expect(
    releaseJobAuthorization(api as Transport, "account-a", "job", signal),
  ).rejects.toThrow("offline");
  expect(jobAuthorization("account-a", "job")).toBeDefined();
  await releaseJobAuthorization(api as Transport, "account-a", "job", signal);
  expect(jobAuthorization("account-a", "job")).toBeUndefined();
  const calls = api.mock.calls.length;
  await releaseJobAuthorization(api as Transport, "account-a", "job", signal);
  expect(api).toHaveBeenCalledTimes(calls);
});

it("retains the explicitly chosen workspace for retries after a failed run releases its permit", async () => {
  const api = vi.fn().mockResolvedValue({ data: {} });
  const signal = new AbortController().signal;
  await authorizeLocalJob(
    api as Transport,
    "account-a",
    10,
    async () => ({ id: "job" }),
    signal,
    () => true,
    "team-a",
  );
  expect(api.mock.calls[0]![0].json.teamId).toBe("team-a");
  await releaseJobAuthorization(api as Transport, "account-a", "job", signal);
  expect(jobAuthorization("account-a", "job")).toBeUndefined();
  expect(jobAuthorizationTeam("account-a", "job")).toBe("team-a");
  expect(jobAuthorizationTeam("account-b", "job")).toBeUndefined();
});
