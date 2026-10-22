import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFormulaEvaluation } from "./useFormulaEvaluation";
import { inlineBinding } from "../model/inline-formula";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => api, useAccountKey: () => "account-1" }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("inline server evaluation", () => {
  it("debounces changes and never displays a previous expression's result", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    api.mockResolvedValue({ data: { result: { value: 40, unit: "Kg" } } });
    const { result, rerender } = renderHook(({ text }) => useFormulaEvaluation(inlineBinding(text, {})), { initialProps: { text: "=80/2" }, wrapper });
    await waitFor(() => expect(result.current.data?.result.value).toBe(40));
    expect(api.mock.calls[0]![0].json.variableBindings).toBeNull();
    let resolve!: (value: unknown) => void;
    api.mockImplementation(() => new Promise((r) => { resolve = r; }));
    rerender({ text: "=80/4" });
    expect(result.current.data).toBeUndefined();
    expect(api).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    rerender({ text: "=80/8" });
    await act(async () => resolve({ data: { result: { value: 20, unit: "Kg" } } }));
    expect(result.current.data).toBeUndefined();
    queryClient.clear();
  });
  it("sends concrete inputs while preserving variable mappings in the document binding", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    api.mockResolvedValue({ data: { result: { value: 80, unit: "Kg" } } });
    const binding = { formulaId: "rule-1", builtIn: null, version: 1, inputs: { base1Rm: { value: 100, unit: "Kg" as const } }, variableBindings: { base1Rm: "maxBench1r" } };
    renderHook(() => useFormulaEvaluation(binding), { wrapper });
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(api.mock.calls[0]![0].json).toEqual({ ...binding, variableBindings: null });
    expect(binding.variableBindings).toEqual({ base1Rm: "maxBench1r" });
    queryClient.clear();
  });
});
