import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type * as UiWeb from "@portable-ui/react";
import { NotificationBell } from "./notifications";

const state = vi.hoisted(() => ({
  count: 2,
  read: vi.fn(),
  readAll: vi.fn(),
  update: true,
}));
vi.mock("@portable-ui/react", async (original) => ({
  ...(await original<typeof UiWeb>()),
  useMobileLayout: () => true,
}));
vi.mock("./provider", () => ({
  useNotifications: () => ({ muted: false, toggleSound: vi.fn() }),
}));
vi.mock("~/shared/session", () => ({
  useAccountContext: () => ({ lifecycle: { isCurrent: () => true } }),
}));
vi.mock("~/shared/i18n/LocaleContext", () => ({ useLocale: () => "en" }));
vi.mock("~/modules/video-analysis", () => ({
  useAnalyzerUpdate: () => (state.update ? { version: "1.4.0" } : null),
  AnalyzerUpdateActions: () => <span>Update analyzer</span>,
}));
vi.mock("./durable-notifications", () => ({
  notificationTitle: () => "Notification",
  useDurableNotifications: () => ({
    count: state.count,
    items: [],
    page: 1,
    unreadOnly: false,
    setUnreadOnly: vi.fn(),
    read: state.read,
    readAll: async () => {
      state.count = 0;
      state.readAll();
    },
  }),
}));

it("pins the device update above notifications and excludes it from marking all read", async () => {
  const view = render(
    <MemoryRouter>
      <NotificationBell label="Notifications" />
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Notifications, 3 unread" }),
  );
  expect(
    await screen.findByText("Analyzer update available (1.4.0)"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
  await waitFor(() => expect(state.readAll).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(
      screen.getByLabelText("Notifications, 1 unread"),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "Mark as read" }),
  ).not.toBeInTheDocument();
  expect(state.read).not.toHaveBeenCalled();
  state.update = false;
  view.rerender(
    <MemoryRouter>
      <NotificationBell label="Notifications" />
    </MemoryRouter>,
  );
  expect(
    screen.queryByText("Analyzer update available (1.4.0)"),
  ).not.toBeInTheDocument();
});
