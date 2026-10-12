import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type * as UiWeb from "@trainflow/ui-web";
import { NotificationBell } from "./notifications";

vi.mock("@trainflow/ui-web", async original => ({ ...await original<typeof UiWeb>(), useMobileLayout: () => true }));
vi.mock("./provider", () => ({ useNotifications: () => ({ muted: false, toggleSound: vi.fn() }) }));
vi.mock("~/shared/session", () => ({ useAccountContext: () => ({ lifecycle: { isCurrent: () => true } }) }));
vi.mock("~/shared/i18n/LocaleContext", () => ({ useLocale: () => "en" }));
vi.mock("./durable-notifications", () => ({ notificationTitle: () => "Notification", useDurableNotifications: () => ({ count: 0, items: [], page: 1, unreadOnly: false, setUnreadOnly: vi.fn() }) }));

it("opens a modal notification sheet from More and restores focus when dismissed", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><NotificationBell label="Notifications" /></MemoryRouter>);
  const trigger = screen.getByRole("button", { name: "Notifications" });
  await user.click(trigger);
  expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeVisible();
  expect(screen.getByText("You're all caught up.")).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});
