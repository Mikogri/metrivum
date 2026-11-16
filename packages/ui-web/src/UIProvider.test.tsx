import { render, screen, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { UIProvider } from "./UIProvider";
import { DateField } from "./primitives/Field/DateField";
import { LoadingState } from "./components/LoadingState/LoadingState";
import { useMobileLayout } from "./lib/useMobileLayout";
it("supplies date picker copy independently of the application", async () => {
  render(
    <UIProvider
      messages={{
        openCalendar: "Pick date",
        calendar: "Schedule",
        chooseYearMonth: "Pick month/year",
      }}
    >
      <DateField label="Date" />
    </UIProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Pick date/ }));
  expect(screen.getByRole("dialog", { name: /Schedule/ })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pick month/year" }),
  ).toBeInTheDocument();
});
it("allows props to override provider copy and keeps English fallbacks", () => {
  render(
    <UIProvider messages={{ loading: "Please wait" }}>
      <LoadingState />
      <LoadingState label="Fetching rows" />
    </UIProvider>,
  );
  expect(screen.getByText("Please wait")).toBeInTheDocument();
  expect(screen.getByText("Fetching rows")).toBeInTheDocument();
});
it("uses the configured query and replaces it when the breakpoint changes", () => {
  const queries: string[] = [];
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    queries.push(query);
    return {
      matches: query.includes("900"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
  });
  let boundary = 900;
  const { result, rerender } = renderHook(useMobileLayout, {
    wrapper: ({ children }) => (
      <UIProvider mobileMaxWidth={boundary}>{children}</UIProvider>
    ),
  });
  expect(result.current).toBe(true);
  expect(queries).toContain("(max-width: 900px)");
  boundary = 500;
  rerender();
  expect(result.current).toBe(false);
  expect(queries).toContain("(max-width: 500px)");
});
