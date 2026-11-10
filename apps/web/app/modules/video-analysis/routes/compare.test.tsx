import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ApiError } from "~/shared/http/errors";
import CompareRoute from "./compare";

const state = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("~/shared/access", () => ({
  RequireFeature: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("~/shared/lib/useUrlState", () => ({
  useUrlState: () => [
    {
      with: encodeURIComponent(
        JSON.stringify([{ kind: "own", id: "foreign", name: "Private video" }]),
      ),
    },
    vi.fn(),
  ],
}));
vi.mock("../components/Compare", () => ({
  useCompareResults: () => [
    { isError: true, error: state.error, data: undefined },
  ],
  CompareView: () => <div>Incorrect loading view</div>,
  CompareDialog: () => null,
  sourceKey: () => "foreign",
}));
it.each([403, 404])(
  "ends comparison loading when another account's item returns %s",
  (status) => {
    state.error = new ApiError(status, null);
    render(
      <MemoryRouter>
        <CompareRoute />
      </MemoryRouter>,
    );
    expect(screen.getByText("This item was not found.")).toBeInTheDocument();
    expect(
      screen.queryByText("Incorrect loading view"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Private video")).not.toBeInTheDocument();
  },
);
