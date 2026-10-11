import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDto } from "@trainflow/api-client-web";
import { ApiError, NetworkError, StaleAccountError } from "~/shared/http/errors";
import type { ApiRequest } from "~/shared/http/transport";
import { addBlock } from "./model/document";
import { useEditor } from "./useEditor";

const calls: ApiRequest[] = [];
let respond: (request: ApiRequest) => Promise<unknown>;

vi.mock("~/shared/session/AccountScope", () => ({
  useApi: () => async (request: ApiRequest) => {
    calls.push(request);
    return respond(request);
  },
  useAccountKey: () => "0:user",
}));

const plan: PlanDto = {
  id: "plan-1",
  name: "Strength A",
  description: "",
  kind: "Program",
  folderId: null,
  archived: false,
  version: 1,
  updatedAt: "2026-10-05T10:00:00Z",
  document: { schemaVersion: 1, blocks: [] },
};

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useEditor saving", () => {
  beforeEach(() => {
    calls.length = 0;
    respond = async (request) => ({ data: { ...plan, version: Number(request.ifMatch) + 1 }, version: Number(request.ifMatch) + 1, status: 200, etag: null, headers: new Headers() });
  });

  it("saves with the version it started from and becomes clean", async () => {
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.apply((doc) => addBlock(doc, "Block 1").doc));
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save());
    expect(calls[0]!.ifMatch).toBe(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(result.current.version).toBe(2);
    expect(result.current.dirty).toBe(false);
    expect(result.current.status).toBe("saved");
  });

  it("stops on a version conflict and never overwrites", async () => {
    respond = async () => {
      throw new ApiError(412, { status: 412, code: "VERSION_CONFLICT" });
    };
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.apply((doc) => addBlock(doc, "Mine").doc));
    await act(() => result.current.save());
    expect(result.current.status).toBe("conflict");
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save());
    expect(calls).toHaveLength(1);
  });

  it("keeps edits made during a save dirty and saves them next with the new version", async () => {
    let release: () => void = () => {};
    respond = (request) =>
      new Promise((resolve) => {
        release = () => resolve({ data: { ...plan, version: Number(request.ifMatch) + 1 }, version: Number(request.ifMatch) + 1, status: 200, etag: null, headers: new Headers() });
      });
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.apply((doc) => addBlock(doc, "First").doc));
    let first!: Promise<void>;
    act(() => {
      first = result.current.save();
    });
    act(() => result.current.apply((doc) => addBlock(doc, "Second").doc));
    // A second save while one is in flight is queued, not sent in parallel.
    act(() => void result.current.save());
    expect(calls).toHaveLength(1);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.ifMatch).toBe(2);
    await act(async () => {
      release();
      await first;
    });
    await waitFor(() => expect(result.current.dirty).toBe(false));
  });

  it("reports offline instead of a fake 'saved'", async () => {
    respond = async () => {
      throw new NetworkError("Failed to fetch");
    };
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.apply((doc) => addBlock(doc, "Block").doc));
    await act(() => result.current.save());
    expect(result.current.status).toBe("offline");
    expect(result.current.dirty).toBe(true);
  });

  it("keeps every queued save caller pending until its edits are saved", async () => {
    const releases: (() => void)[] = [];
    respond = (request) => new Promise(resolve => {
      releases.push(() => resolve({ data: { ...plan, version: Number(request.ifMatch) + 1 }, version: Number(request.ifMatch) + 1 }));
    });
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.updateMeta({ name: "First" }));
    let first!: Promise<void>;
    act(() => { first = result.current.save(); });
    act(() => result.current.updateMeta({ name: "Second" }));
    const finished = vi.fn();
    let second!: Promise<void>;
    act(() => { second = result.current.save().then(finished); });
    await act(async () => { releases[0]!(); });
    expect(calls).toHaveLength(2);
    expect(finished).not.toHaveBeenCalled();
    await act(async () => { releases[1]!(); await Promise.all([first, second]); });
    expect(finished).toHaveBeenCalledOnce();
    expect(result.current.dirty).toBe(false);
    expect(result.current.version).toBe(3);
  });

  it("ignores edits when read-only", () => {
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: true }), { wrapper });
    act(() => result.current.apply((doc) => addBlock(doc, "Block").doc));
    expect(result.current.dirty).toBe(false);
  });

  it("drops queued saves when the current request loses its account", async () => {
    let reject!: (reason: unknown) => void;
    respond = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }))
      .mockRejectedValue(new StaleAccountError());
    const { result } = renderHook(() => useEditor(plan, 1, { readOnly: false }), { wrapper });
    act(() => result.current.updateMeta({ name: "First" }));
    let first!: Promise<void>;
    act(() => { first = result.current.save(); });
    act(() => result.current.updateMeta({ name: "Second" }));
    let second!: Promise<void>;
    act(() => { second = result.current.save(); });
    await act(async () => { reject(new StaleAccountError()); await Promise.all([first, second]); });
    expect(calls).toHaveLength(1);
    expect(result.current.dirty).toBe(true);
  });
});
