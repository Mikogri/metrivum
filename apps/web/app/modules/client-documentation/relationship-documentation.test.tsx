import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  BodyMeasurements,
  RelationshipDocumentation,
} from "./relationship-documentation";

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  api: vi.fn(),
  documents: [] as unknown[],
}));
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountKey: () => "coach-account",
  useApi: () => state.api,
  useAccountContext: () => ({
    api: state.api,
    lifecycle: {
      isCurrent: () => true,
      signal: () => new AbortController().signal,
    },
  }),
}));
vi.mock("~/modules/coaching", () => ({
  useCoachingMutation: () => ({ mutate: state.mutate }),
  Loading: () => null,
  Failure: () => null,
  MutationError: () => null,
  ListPagination: () => null,
  useCoachingQuery: (path: string) => ({
    isPending: false,
    isError: false,
    data: path.endsWith("/measurement-definitions")
      ? [
          { key: "weight", label: "Body weight", units: ["kg"] },
          { key: "body-fat", label: "Body fat", units: ["%"] },
        ]
      : path.endsWith("/measurements/trend")
        ? {
            points: [
              { observedAt: "2026-01-01", value: 20 },
              { observedAt: "2026-01-11", value: 18 },
            ],
            latestValue: 18,
            latestAt: "2026-01-11",
            change: -2,
            aggregation: "Daily average (UTC)",
          }
        : path.endsWith("/measurements")
          ? {
              items: [
                {
                  id: "measurement",
                  key: "weight",
                  unit: "kg",
                  value: 80,
                  observedAt: "2026-01-01",
                  source: "Manual",
                  authorId: "coach",
                  version: 3,
                },
              ],
              page: 1,
              pageSize: 15,
              total: 1,
            }
          : path.endsWith("/documents")
            ? {
                items: state.documents,
                page: 1,
                pageSize: 12,
                total: state.documents.length,
              }
            : {
                coach: true,
                status: "Active",
                allowedActions: ["measure", "create"],
              },
  }),
}));
beforeEach(() => {
  state.mutate.mockClear();
  state.api.mockReset().mockResolvedValue({ data: {} });
  state.documents = [];
});

it("confirms retention-safe document deletion with its current version", async () => {
  state.documents = [
    {
      id: "document",
      title: "Photo",
      version: 4,
      observedAt: "2026-01-01",
      createdAt: "2026-01-01",
      authorId: "coach",
      allowedActions: ["delete"],
      hasFile: false,
      visibility: "CoachPrivate",
    },
  ];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RelationshipDocumentation relationshipId="relationship" />
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for Photo" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Delete document" }),
  );
  expect(state.mutate).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Delete document" }),
  );
  expect(state.mutate).toHaveBeenCalledWith({
    method: "DELETE",
    path: "/api/v1/coaching/relationships/relationship/documentation/documents/document",
    ifMatch: 4,
  });
});

it("provides one Files area with category filtering and separate coach notes", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RelationshipDocumentation relationshipId="relationship" />
    </QueryClientProvider>,
  );
  expect(
    screen.queryByRole("radio", { name: "Photos" }),
  ).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("toolbar", { name: "Documentation" })).getByRole(
      "button",
      { name: /File category/ },
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Files" })).toBeInTheDocument();
  expect(
    screen.getByRole("radio", { name: "Private Coach Notes" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("radio", { name: "Measurements" }),
  ).not.toBeInTheDocument();
});

it("sends corrections through the versioned measurement endpoint", async () => {
  render(<BodyMeasurements relationshipId="relationship" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit measurement" }));
  const value = screen.getByRole("spinbutton", { name: "Value (kg)" });
  await user.clear(value);
  await user.type(value, "79");
  await user.click(screen.getByRole("button", { name: "Save measurement" }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "PATCH",
      path: "/api/v1/coaching/relationships/relationship/documentation/measurements/measurement",
      ifMatch: 3,
      json: expect.objectContaining({ value: 79 }),
    }),
  );
});

it("expresses body fat delta in percentage points", async () => {
  render(<BodyMeasurements relationshipId="relationship" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Measurement/ }));
  await user.click(screen.getByRole("option", { name: "Body fat" }));
  expect(screen.getByText("-2 pp")).toBeInTheDocument();
});

it.each([false, true])(
  "lets either role create a private document or explicitly share it (client=%s)",
  async (clientView) => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RelationshipDocumentation
          relationshipId="relationship"
          clientView={clientView}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Title$/ }),
      "My file",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Document text" }),
      "Private content",
    );
    expect(
      screen.getByRole("button", { name: /Visibility/ }),
    ).toHaveTextContent("Only me");
    await user.click(screen.getByRole("button", { name: "Save document" }));
    await waitFor(() =>
      expect(state.api).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({ visibility: "CoachPrivate" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add file" }));
    await user.type(
      screen.getByRole("textbox", { name: /^Title$/ }),
      "Shared file",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Document text" }),
      "Shared content",
    );
    await user.click(screen.getByRole("button", { name: /Visibility/ }));
    await user.click(
      screen.getByRole("option", {
        name: clientView ? "Shared with coach" : "Shared with client",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save document" }));
    await waitFor(() =>
      expect(state.api).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({ visibility: "SharedWithClient" }),
        }),
      ),
    );
  },
);

it("labels client private files and permits versioned sharing for their author", async () => {
  state.documents = [
    {
      id: "document",
      title: "My record",
      version: 4,
      observedAt: "2026-01-01",
      allowedActions: ["share"],
      hasFile: false,
      visibility: "CoachPrivate",
    },
  ];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RelationshipDocumentation relationshipId="relationship" clientView />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Only me", { exact: true })).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for My record" }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Share with coach" }),
  );
  expect(state.mutate).toHaveBeenCalledWith({
    method: "POST",
    path: "/api/v1/coaching/relationships/relationship/documentation/documents/document/share",
    ifMatch: 4,
    json: { visibility: "SharedWithClient" },
  });
});

it("removes a progress photo when its signed URL expires even if refresh fails", async () => {
  state.documents = [
    {
      id: "photo",
      title: "Progress photo",
      version: 1,
      observedAt: "2026-01-01",
      allowedActions: [],
      hasFile: true,
      visibility: "CoachPrivate",
    },
  ];
  state.api
    .mockImplementationOnce(async () => ({
      data: {
        url: "https://example.test/photo",
        expiresAt: new Date(Date.now() + 300).toISOString(),
      },
    }))
    .mockRejectedValue(new Error("No longer accessible"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RelationshipDocumentation relationshipId="relationship" />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /File category/ }));
  await userEvent.click(
    screen.getByRole("option", { name: "Progress photos" }),
  );
  expect(
    await screen.findByRole("img", { name: "Progress photo" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("img", { name: "Progress photo" }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(state.api).toHaveBeenCalledTimes(2), {
    timeout: 2000,
  });
  expect(
    screen.queryByRole("img", { name: "Progress photo" }),
  ).not.toBeInTheDocument();
});
