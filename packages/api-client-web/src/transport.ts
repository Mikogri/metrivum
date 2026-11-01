import type { ProblemDetails } from "@metrivum/api-client-web";
import { ApiError, NetworkError, StaleAccountError } from "./errors";

type QueryScalar = string | number | boolean | null | undefined;
export type QueryValue = QueryScalar | readonly QueryScalar[];

export interface ApiRequest {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    /** Path relative to the API base, e.g. "/api/v1/me". Absolute URLs are rejected. */
    path: string;
    query?: Record<string, QueryValue>;
    /** JSON body. */
    json?: unknown;
    /** Raw body (CSV import) with its content type. */
    raw?: { body: string | Blob; contentType: string };
    /** Resource version. Sent as a strong quoted ETag: If-Match: "3". */
    ifMatch?: number | string;
    /** Required by publish, import commit and analysis creation. Keep it for retries of the same operation. */
    idempotencyKey?: string;
    /** "json" (default), "blob" for CSV/PDF downloads, "none" for 202/204. */
    responseType?: "json" | "blob" | "none";
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface ApiResponse<T> {
    data: T;
    status: number;
    /** Numeric resource version parsed from the ETag header, when present. */
    version: number | null;
    etag: string | null;
    headers: Headers;
}

export interface TransportConfig {
    baseUrl: string;
    /** Returns the access token of *this* account. `forceRefresh` asks the SDK to refresh first. */
    getAccessToken: (options?: {
        forceRefresh?: boolean;
    }) => Promise<string | null>;
    /** Aborted when the account is switched or signed out; every request of the account listens to it. */
    accountSignal: () => AbortSignal;
    /** True while this account is still the one shown in the UI. */
    isCurrent: () => boolean;
    /** Called after a 401 that survived one refresh. */
    onUnauthorized?: () => void;
    fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const SAFE_METHODS = new Set(["GET"]);

export function parseVersion(etag: string | null): number | null {
    if (!etag) return null;
    const match = /^(?:W\/)?"?(\d+)"?$/.exec(etag.trim());
    return match ? Number(match[1]) : null;
}

export function buildUrl(
    baseUrl: string,
    path: string,
    query?: Record<string, QueryValue>,
): string {
    // The bearer token must only ever reach the configured API host.
    if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.includes("://")
    ) {
        throw new Error(`API paths must be relative to the API base: ${path}`);
    }
    const base = new URL(baseUrl);
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
    if (url.origin !== base.origin)
        throw new Error("API request escaped the configured origin.");
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            // Optional parameters are omitted, never sent as "null".
            if (value === undefined || value === null || value === "") continue;
            if (Array.isArray(value)) {
                url.searchParams.delete(key);
                for (const item of value) {
                    if (item !== undefined && item !== null && item !== "")
                        url.searchParams.append(key, String(item));
                }
            } else url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) return { status: response.status };
    try {
        return (await response.json()) as ProblemDetails;
    } catch {
        return { status: response.status };
    }
}

export type Transport = <T>(request: ApiRequest) => Promise<ApiResponse<T>>;

export function createTransport(config: TransportConfig): Transport {
    const fetchImpl =
        config.fetchImpl ??
        ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

    function assertCurrent(request: ApiRequest) {
        if (!config.isCurrent() || config.accountSignal().aborted)
            throw new StaleAccountError();
        if (request.signal?.aborted) {
            const error = new Error("Request was cancelled.");
            error.name = "AbortError";
            throw error;
        }
    }

    async function send(
        request: ApiRequest,
        token: string | null,
        signal: AbortSignal,
    ): Promise<Response> {
        // Token retrieval can outlive an account switch, including replacement in the same slot.
        assertCurrent(request);
        const headers = new Headers({ Accept: "application/json" });
        if (token) headers.set("Authorization", `Bearer ${token}`);
        let body: BodyInit | undefined;
        if (request.json !== undefined) {
            headers.set("Content-Type", "application/json");
            body = JSON.stringify(request.json);
        } else if (request.raw) {
            headers.set("Content-Type", request.raw.contentType);
            body = request.raw.body;
        }
        if (request.ifMatch !== undefined) {
            const value = String(request.ifMatch);
            headers.set(
                "If-Match",
                value.startsWith('"') ? value : `"${value}"`,
            );
        }
        if (request.idempotencyKey)
            headers.set("Idempotency-Key", request.idempotencyKey);
        if (request.responseType === "blob")
            headers.set(
                "Accept",
                "text/csv, application/pdf, application/problem+json",
            );

        try {
            return await fetchImpl(
                buildUrl(config.baseUrl, request.path, request.query),
                {
                    method: request.method ?? "GET",
                    headers,
                    body,
                    signal,
                    credentials: "omit",
                    cache: "no-store",
                },
            );
        } catch (error) {
            if (signal.aborted) throw error;
            throw new NetworkError(
                error instanceof Error
                    ? error.message
                    : "Network request failed.",
            );
        }
    }

    return async function transport<T>(
        request: ApiRequest,
    ): Promise<ApiResponse<T>> {
        assertCurrent(request);
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const signals = [config.accountSignal(), request.signal].filter(
            (signal): signal is AbortSignal => Boolean(signal),
        );
        const abort = () => controller.abort();
        signals.forEach((signal) => {
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
        });
        const assertRequest = () => {
            assertCurrent(request);
            if (timedOut)
                throw new NetworkError(
                    "The server did not respond in time.",
                    true,
                );
        };
        try {
            const method = request.method ?? "GET";
            const token = await config.getAccessToken();
            assertRequest();
            let response = await send(request, token, controller.signal);
            assertRequest();

            // One refresh attempt. Only safe reads are replayed; writes are never resent automatically.
            if (response.status === 401 && SAFE_METHODS.has(method)) {
                const refreshed = await config.getAccessToken({
                    forceRefresh: true,
                });
                assertRequest();
                if (refreshed) {
                    await response.body?.cancel().catch(() => {});
                    response = await send(
                        request,
                        refreshed,
                        controller.signal,
                    );
                }
            }

            // A late response from an account the user already left is dropped, never rendered.
            assertRequest();

            if (!response.ok) {
                const problem = await readProblem(response);
                assertRequest();
                if (response.status === 401) config.onUnauthorized?.();
                const retryAfter = response.headers.get("Retry-After");
                throw new ApiError(
                    response.status,
                    problem,
                    retryAfter ? Number(retryAfter) || null : null,
                );
            }

            const etag = response.headers.get("ETag");
            let data: unknown = undefined;
            const responseType = request.responseType ?? "json";
            try {
                if (responseType === "blob") {
                    data = await response.blob();
                } else if (
                    responseType === "json" &&
                    response.status !== 204 &&
                    response.status !== 202
                ) {
                    const text = await response.text();
                    assertRequest();
                    data = text ? JSON.parse(text) : undefined;
                }
            } finally {
                assertRequest();
            }
            return {
                data: data as T,
                status: response.status,
                etag,
                version: parseVersion(etag),
                headers: response.headers,
            };
        } catch (error) {
            assertRequest();
            throw error;
        } finally {
            clearTimeout(timer);
            signals.forEach((signal) =>
                signal.removeEventListener("abort", abort),
            );
            // Also release intentionally unread bodies (202/204/responseType=none).
            controller.abort();
        }
    };
}

/** Random key for idempotent operations. Generate once per user action and keep it for retries. */
export function newIdempotencyKey(): string {
    return crypto.randomUUID();
}
