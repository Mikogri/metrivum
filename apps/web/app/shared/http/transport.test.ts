import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, StaleAccountError } from "./errors";
import { buildUrl, createTransport, parseVersion } from "./transport";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function setup(responses: Array<Response | Error>, options: { current?: () => boolean } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    // Like real fetch: an already-aborted signal rejects before any response.
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const next = responses.shift();
    if (!next) throw new Error("no response queued");
    if (next instanceof Error) throw next;
    return next;
  });
  const tokens = ["token-1", "token-2"];
  const getAccessToken = vi.fn(async ({ forceRefresh }: { forceRefresh?: boolean } = {}) => (forceRefresh ? tokens[1]! : tokens[0]!));
  const controller = new AbortController();
  const transport = createTransport({
    baseUrl: "https://api.example.test",
    getAccessToken,
    accountSignal: () => controller.signal,
    isCurrent: options.current ?? (() => true),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { transport, calls, getAccessToken, controller };
}

describe("buildUrl", () => {
  it("keeps the token on the configured API origin", () => {
    expect(() => buildUrl("https://api.example.test", "https://evil.test/x")).toThrow();
    expect(() => buildUrl("https://api.example.test", "//evil.test/x")).toThrow();
    expect(buildUrl("https://api.example.test", "/api/v1/me")).toBe("https://api.example.test/api/v1/me");
  });

  it("omits empty optional parameters instead of sending 'null'", () => {
    const url = buildUrl("https://api.example.test", "/api/v1/exercises", { Search: "squat", TagId: undefined, MuscleKey: null, Page: 2, FavoritesOnly: false });
    expect(url).toBe("https://api.example.test/api/v1/exercises?Search=squat&Page=2&FavoritesOnly=false");
  });
});

describe("parseVersion", () => {
  it("reads quoted numeric ETags", () => {
    expect(parseVersion('"3"')).toBe(3);
    expect(parseVersion('W/"12"')).toBe(12);
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion('"abc"')).toBeNull();
  });
});

describe("transport", () => {
  it("does not send a write when the account changes during token lookup", async () => {
    let current = true;
    let release!: (token: string) => void;
    const token = new Promise<string>(resolve => { release = resolve; });
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const transport = createTransport({ baseUrl: "https://api.example.test", getAccessToken: () => token,
      accountSignal: () => new AbortController().signal, isCurrent: () => current, fetchImpl });
    const pending = transport({ method: "POST", path: "/api/v1/teams/t/leave" });
    current = false;
    release("new-account-token");
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not refresh an account after its late 401 response", async () => {
    let current = true;
    let release!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { release = resolve; });
    const getAccessToken = vi.fn(async () => "token");
    const fetchImpl = vi.fn(() => response);
    const transport = createTransport({ baseUrl: "https://api.example.test", getAccessToken,
      accountSignal: () => new AbortController().signal, isCurrent: () => current, fetchImpl });
    const pending = transport({ path: "/api/v1/me" });
    await Promise.resolve();
    current = false;
    release(jsonResponse(401, { code: "UNAUTHENTICATED" }));
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['{"secret":"old account"}', 'invalid json'])("drops a stale response body: %s", async (text) => {
    let current = true;
    let release!: (text: string) => void;
    let reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    const body = new Promise<string>(resolve => { release = resolve; });
    const response = jsonResponse(200, {});
    response.text = () => { reading(); return body; };
    const { transport } = setup([response], { current: () => current });
    const pending = transport({ path: "/api/v1/me" });
    await started;
    current = false;
    release(text);
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
  });

  it("drops body read failures after the account changes", async () => {
    let current = true;
    let fail!: (error: Error) => void;
    let reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    const body = new Promise<string>((_, reject) => { fail = reject; });
    const response = jsonResponse(200, {});
    response.text = () => { reading(); return body; };
    const { transport } = setup([response], { current: () => current });
    const pending = transport({ path: "/api/v1/me" });
    await started;
    current = false;
    fail(new Error("old account body failed"));
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
  });

  it("sends bearer, If-Match as a strong quoted ETag and the idempotency key", async () => {
    const { transport, calls } = setup([jsonResponse(200, { id: "x", version: 4 }, { ETag: '"4"' })]);
    const result = await transport({ method: "POST", path: "/api/v1/training/programs/x/revisions", ifMatch: 3, idempotencyKey: "key-1" });
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("If-Match")).toBe('"3"');
    expect(headers.get("Idempotency-Key")).toBe("key-1");
    expect(calls[0]!.init.credentials).toBe("omit");
    expect(result.version).toBe(4);
  });

  it("refreshes once and replays a 401 for safe reads", async () => {
    const { transport, calls, getAccessToken } = setup([jsonResponse(401, { code: "UNAUTHENTICATED" }), jsonResponse(200, { ok: true })]);
    const result = await transport<{ ok: boolean }>({ path: "/api/v1/me" });
    expect(result.data.ok).toBe(true);
    expect(getAccessToken).toHaveBeenCalledWith({ forceRefresh: true });
    expect(new Headers(calls[1]!.init.headers).get("Authorization")).toBe("Bearer token-2");
  });

  it("never resends a write after 401", async () => {
    const onUnauthorized = vi.fn();
    const calls: unknown[] = [];
    const transport = createTransport({
      baseUrl: "https://api.example.test",
      getAccessToken: async () => "t",
      accountSignal: () => new AbortController().signal,
      isCurrent: () => true,
      onUnauthorized,
      fetchImpl: (async () => {
        calls.push(1);
        return jsonResponse(401, { code: "UNAUTHENTICATED" });
      }) as unknown as typeof fetch,
    });
    await expect(transport({ method: "PUT", path: "/api/v1/training/programs/x/draft", json: {} })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("does not refresh on 403 and exposes the stable code", async () => {
    const { transport, getAccessToken } = setup([jsonResponse(403, { status: 403, code: "FEATURE_UNAVAILABLE", traceId: "t-1" })]);
    const error = await transport({ path: "/api/v1/exercises" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("FEATURE_UNAVAILABLE");
    expect((error as ApiError).traceId).toBe("t-1");
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("drops responses that arrive after the account changed", async () => {
    let current = true;
    const { transport } = setup([jsonResponse(200, { secret: "old account" })], { current: () => current });
    const pending = transport({ path: "/api/v1/me" });
    current = false;
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
  });

  it("treats an aborted account signal as stale, not as a network failure", async () => {
    const { transport, controller } = setup([jsonResponse(200, { never: "seen" })]);
    controller.abort();
    await expect(transport({ path: "/api/v1/me" })).rejects.toBeInstanceOf(StaleAccountError);
  });

  it("maps fetch failures to NetworkError and handles empty 202/204", async () => {
    const { transport } = setup([new TypeError("Failed to fetch"), new Response(null, { status: 204 })]);
    await expect(transport({ path: "/api/v1/me" })).rejects.toBeInstanceOf(NetworkError);
    const empty = await transport({ method: "DELETE", path: "/api/v1/exercises/x/favorite", responseType: "none" });
    expect(empty.data).toBeUndefined();
  });
});
