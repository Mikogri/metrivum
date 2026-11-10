import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import Forms from "./forms";

const mocks = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
vi.mock("~/shared/access", () => ({
  useAccessSnapshot: () => ({
    data: { features: [{ key: "forms.application.manage", available: true }] },
  }),
}));
vi.mock("../api", () => ({
  useCoachingQuery: (...args: unknown[]) => mocks.query(...args),
  useCoachingMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.query.mockReset().mockReturnValue({
    data: {
      items: [
        {
          id: "summary-form",
          name: "Daily form",
          purpose: "Application",
          description: "Private intake",
          archived: true,
          currentPublishedVersionId: null,
          updatedAt: "2026-10-20T12:00:00Z",
          version: 7,
          questionCount: 3,
          estimatedSeconds: 30,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    isPending: false,
    isError: false,
  });
});

it.each(["list", "cards"])(
  "renders %s using only summaries and restores with the summary revision",
  async (view) => {
    render(
      <MemoryRouter initialEntries={[`/app/forms?view=${view}&archived=true`]}>
        <Forms />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Daily form" })).toHaveAttribute(
      "href",
      "/app/forms/summary-form",
    );
    expect(mocks.query).toHaveBeenCalledWith(
      "/api/v1/forms/summaries",
      expect.objectContaining({
        purpose: "Application",
        archived: true,
        page: 1,
        pageSize: 20,
      }),
      true,
    );
    if (view === "cards")
      expect(screen.getByText("3 questions")).toBeInTheDocument();
    // Restore lives in the form's ⋯ menu, in both views.
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Daily form" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Restore" }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        method: "POST",
        path: "/api/v1/forms/summary-form/restore",
        ifMatch: 7,
      },
      expect.anything(),
    );
  },
);
