import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { FormulaDialog } from "./FormulaDialog";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({
  useApi: () => api,
  useAccountKey: () => "account-a",
}));
vi.mock("../editor/client-context", () => ({
  useClientFormulaContext: () => ({
    variables: { maxBench1r: { value: 100, unit: "Kg" } },
  }),
}));

describe("formula creation from the editor", () => {
  it("declares a selected client alias as a typed reusable formula input", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FormulaDialog formula="new" onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    const expression = await screen.findByRole("combobox", {
      name: /Expression/i,
    });
    fireEvent.change(expression, {
      target: { value: "maxB", selectionStart: 4 },
    });
    fireEvent.click(screen.getByRole("option", { name: /maxBench1r/ }));
    expect(expression).toHaveValue("maxBench1r");
    expect(screen.getAllByDisplayValue("maxBench1r")).toHaveLength(2);
    queryClient.clear();
  });
});
