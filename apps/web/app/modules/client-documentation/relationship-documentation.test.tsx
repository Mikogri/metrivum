import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { BodyMeasurements, RelationshipDocumentation } from "./relationship-documentation";

const state = vi.hoisted(() => ({ mutate: vi.fn(), documents: [] as unknown[] }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountKey: () => "coach-account", useApi: () => vi.fn() }));
vi.mock("~/modules/coaching", () => ({
  useCoachingMutation: () => ({ mutate: state.mutate }), Loading: () => null, Failure: () => null, MutationError: () => null, ListPagination: () => null,
  useCoachingQuery: (path: string) => ({ isPending: false, isError: false, data:
    path.endsWith("/measurement-definitions") ? [{ key: "weight", label: "Body weight", units: ["kg"] }, { key: "body-fat", label: "Body fat", units: ["%"] }] :
    path.endsWith("/measurements/trend") ? { points: [{ observedAt: "2026-01-01", value: 20 }, { observedAt: "2026-01-11", value: 18 }], latestValue: 18, latestAt: "2026-01-11", change: -2, aggregation: "Daily average (UTC)" } :
    path.endsWith("/measurements") ? { items: [{ id: "measurement", key: "weight", unit: "kg", value: 80, observedAt: "2026-01-01", source: "Manual", authorId: "coach", version: 3 }], page: 1, pageSize: 15, total: 1 } :
    path.endsWith("/documents") ? { items: state.documents, page: 1, pageSize: 12, total: state.documents.length } : { coach: true, status: "Active", allowedActions: ["measure", "create"] },
  }),
}));
beforeEach(() => { state.mutate.mockClear(); state.documents = []; });

it("confirms retention-safe document deletion with its current version", async () => {
  state.documents = [{ id: "document", title: "Photo", version: 4, observedAt: "2026-01-01", createdAt: "2026-01-01", authorId: "coach", allowedActions: ["delete"], hasFile: false, visibility: "CoachPrivate" }];
  render(<QueryClientProvider client={new QueryClient()}><RelationshipDocumentation relationshipId="relationship" /></QueryClientProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Actions for Photo" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete document" }));
  expect(state.mutate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete document" }));
  expect(state.mutate).toHaveBeenCalledWith({ method: "DELETE", path: "/api/v1/coaching/relationships/relationship/documentation/documents/document", ifMatch: 4 });
});

it("keeps body metrics out of the three documentation sections", () => {
  render(<QueryClientProvider client={new QueryClient()}><RelationshipDocumentation relationshipId="relationship" /></QueryClientProvider>);
  expect(screen.getByRole("radio", { name: "Photos" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Files" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Private Coach Notes" })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Measurements" })).not.toBeInTheDocument();
});

it("sends corrections through the versioned measurement endpoint", async () => {
  render(<BodyMeasurements relationshipId="relationship" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit measurement" }));
  const value = screen.getByRole("spinbutton", { name: "Value (kg)" });
  await user.clear(value); await user.type(value, "79");
  await user.click(screen.getByRole("button", { name: "Save measurement" }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/coaching/relationships/relationship/documentation/measurements/measurement", ifMatch: 3, json: expect.objectContaining({ value: 79 }) }));
});

it("expresses body fat delta in percentage points", async () => {
  render(<BodyMeasurements relationshipId="relationship" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Measurement/ }));
  await user.click(screen.getByRole("option", { name: "Body fat" }));
  expect(screen.getByText("-2 pp")).toBeInTheDocument();
});
