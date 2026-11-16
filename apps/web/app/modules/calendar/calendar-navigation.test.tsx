import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";
import type * as UiWeb from "@portable-ui/react";
import CalendarRoute from "./routes/calendar";

vi.mock("@portable-ui/react", async (original) => ({
  ...(await original<typeof UiWeb>()),
  useMobileLayout: () => true,
}));
vi.mock("~/shared/session/WorkspaceScope", () => ({
  useWorkspace: () => ({ mode: "client" }),
}));
vi.mock("~/modules/accounts", () => ({
  useProfile: () => ({ timeZone: "UTC" }),
}));
vi.mock("~/shared/lib/useConfirm", () => ({
  useDiscardConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock("~/modules/coaching", () => ({
  Failure: () => null,
  Loading: () => null,
  ScheduleEditorPanel: () => null,
}));
vi.mock("./EventEditor", () => ({ EventEditor: () => null }));
vi.mock("./EventDetail", () => ({
  EventDetail: ({ id }: { id: string }) => <p>Event detail: {id}</p>,
}));
vi.mock("./api", () => ({
  useCalendarWorkouts: () => ({ data: [], isPending: false }),
  useCalendarRange: (path: string) => ({
    data: path.includes("/events")
      ? [
          {
            id: "meeting-one",
            title: "Training review",
            startsAtUtc: "2026-10-12T09:00:00Z",
            endsAtUtc: "2026-10-12T10:00:00Z",
            kind: "Meeting",
          },
        ]
      : [],
    isPending: false,
  }),
}));

function setup(url: string) {
  const router = createMemoryRouter(
    [{ path: "/app/calendar", Component: CalendarRoute }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

it("opens an event deep link and removes only the event parameter on close", async () => {
  const user = userEvent.setup();
  const router = setup(
    "/app/calendar?date=2026-10-12&view=week&event=linked-meeting",
  );
  expect(await screen.findByText("Event detail: linked-meeting")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Details" }),
    ).not.toBeInTheDocument(),
  );
  expect(router.state.location.search).toBe("?date=2026-10-12&view=week");
});

it("records event selection in the URL and browser Back restores the agenda", async () => {
  const user = userEvent.setup();
  const router = setup("/app/calendar?date=2026-10-12");
  await user.click(screen.getByRole("button", { name: /Training review/ }));
  expect(router.state.location.search).toBe(
    "?date=2026-10-12&event=meeting-one",
  );
  expect(await screen.findByText("Event detail: meeting-one")).toBeVisible();
  await act(async () => {
    await router.navigate(-1);
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Details" }),
    ).not.toBeInTheDocument(),
  );
  expect(router.state.location.search).toBe("?date=2026-10-12");
});
