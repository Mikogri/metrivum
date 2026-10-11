import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AnalysesRoute from "./analyses";

const access = vi.hoisted(() => ({ allowed: true }));
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());
vi.mock("~/shared/access", () => ({
  useFeatures: () => ({ "video.library.manage": access, "video.analysis.run": access, "video.analysis.compare": access }),
  LockedReason: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => ({}), useAccountKey: () => "test" }));
vi.mock("~/shared/lib/useErrorToast", () => ({ useErrorToast: () => vi.fn() }));
vi.mock("../queries", () => ({
  useAnalysisList: () => ({ data: [{ id: "analysis-1", name: "Squat analysis", status: "Completed", tags: ["squat"], createdAt: "2026-10-01T10:00:00Z" }] }),
  useMediaList: () => ({ data: [
    { id: "video-1", name: "Squat video", state: "Ready", contentType: "video/mp4", size: 1024, createdAt: "2026-10-01T10:00:00Z" },
    { id: "video-2", name: "Pinned video", state: "Ready", pinned: true, contentType: "video/mp4", size: 1024, createdAt: "2026-10-01T10:00:00Z" },
    { id: "video-3", name: "Deleting video", state: "Deleting", contentType: "video/mp4", size: 1024, createdAt: "2026-10-01T10:00:00Z" },
  ] }),
  videoKeys: { all: () => ["video"] },
}));
function Location() { return <output data-testid="url">{useLocation().search}</output>; }
function mount(url: string) {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><AnalysesRoute /><Location /></MemoryRouter></QueryClientProvider>);
}

it("switches analysis views while preserving query and page", () => {
  mount("/app/video-analyses?q=Squat&page=2");
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Squat analysis" })).toHaveAttribute("href", "/app/video-analyses/analysis-1");
  expect(screen.getByTestId("url")).toHaveTextContent("q=Squat&page=2&view=cards");
});

it("shows media cards with the same deletion restrictions and confirmation", () => {
  access.allowed = true;
  mount("/app/video-analyses?tab=videos&view=cards");
  const [readyCard, pinnedCard, deletingCard] = screen.getAllByRole("listitem");
  if (!readyCard || !pinnedCard || !deletingCard) throw new Error("Expected ready, pinned, and deleting media cards");
  expect(within(pinnedCard).getByRole("button", { name: "Delete video" })).toBeDisabled();
  expect(within(deletingCard).getByRole("button", { name: "Delete video" })).toBeDisabled();
  fireEvent.click(within(readyCard).getByRole("button", { name: "Delete video" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});

it("keeps deletion disabled without media management access in cards", () => {
  access.allowed = false;
  mount("/app/video-analyses?tab=videos&view=cards");
  for (const button of screen.getAllByRole("button", { name: "Delete video" })) expect(button).toBeDisabled();
  access.allowed = true;
});
