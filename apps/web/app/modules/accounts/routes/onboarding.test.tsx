import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import type * as Ui from "@trainflow/ui-web";
import { beforeEach, expect, it, vi } from "vitest";
import type { ApiRequest } from "~/shared/http/transport";
import { ApiError } from "~/shared/http/errors";
import Onboarding from "./onboarding";

const mocks = vi.hoisted(() => ({ api: vi.fn<(request: ApiRequest) => Promise<unknown>>() }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => mocks.api, useAccountKey: () => "account" }));
// The segmented date field does not take typed keys in jsdom; a plain date input stands in for it.
vi.mock("@trainflow/ui-web", async (original) => ({
  ...(await original<typeof Ui>()),
  DateField: ({ label, onChange }: { label: string; onChange: (value: CalendarDate) => void }) => <input aria-label={label} onChange={(event) => onChange(parseDate(event.target.value))} />,
}));
vi.mock("../components/AccountGate", () => ({ AccountGate: ({ children }: { children: ReactNode }) => children }));

const calls = (path: string, method = "GET") => mocks.api.mock.calls.map(([request]) => request).filter((request) => request.path === path && (request.method ?? "GET") === method);
function setup(role: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/onboarding?role=${role}`]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="*" element={<p>Signed in</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
async function account() {
  await userEvent.type(screen.getByLabelText(/^Username/), "new_client");
  await userEvent.type(screen.getByLabelText(/^First and last name/), "New Client");
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-01-01" } });
  await userEvent.click(screen.getByText(/^I accept the Metrivum terms/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("About you");
}
beforeEach(() => {
  mocks.api.mockReset().mockImplementation(async ({ path }: ApiRequest) => ({ data: path === "/api/v1/me/profile-fields" ? { currency: "EUR", values: {}, version: 4 } : { id: "user", onboarded: true } }));
});

it("asks a client for sex, height and weight before the account is created, then saves them", async () => {
  setup("Client");
  await account();
  expect(mocks.api).not.toHaveBeenCalled();

  // The body step cannot be passed empty by a client.
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.queryByText("Your training")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /Sex/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Female" }));
  await userEvent.type(screen.getByLabelText(/^Height/), "168");
  await userEvent.type(screen.getByLabelText(/^Weight/), "61.5");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  // Heart rate: the estimate from the birth date fills the field.
  await screen.findByText("Heart rate and recovery");
  const estimate = screen.getByRole("button", { name: /^Use estimate/ });
  const bpm = Number(/(\d+) bpm/.exec(estimate.textContent ?? "")![1]);
  await userEvent.click(estimate);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  await screen.findByText("Your training");
  await userEvent.type(screen.getByLabelText(/^Training sessions per week/), "3");
  await userEvent.click(screen.getByRole("button", { name: "Mon" }));
  await userEvent.click(screen.getByRole("button", { name: "Wed" }));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));

  await screen.findByText("Health and goals");
  await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Signed in");

  expect(calls("/api/v1/me/onboarding", "PUT")[0]!.json).toMatchObject({ username: "new_client", role: "Client", birthDate: "1990-01-01" });
  const saved = calls("/api/v1/me/profile-fields", "PATCH")[0]!;
  expect(saved.ifMatch).toBe(4);
  expect(saved.json).toEqual({ values: { Sex: "Female", Height: 168, Weight: 61.5, HrMax: bpm, SessionsPerWeek: 3, PreferredTrainingDays: [1, 3] } });
}, 20_000);

it("lets a coach pass the extra steps empty and saves no profile details", async () => {
  setup("Coach");
  await account();
  // Every extra step is optional for a coach: continue through all of them empty.
  for (const title of ["Heart rate and recovery", "Your training", "Health and goals"]) {
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(title);
  }
  await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Signed in");
  await waitFor(() => expect(calls("/api/v1/me/onboarding", "PUT")).toHaveLength(1));
  expect(calls("/api/v1/me/profile-fields")).toHaveLength(0);
  expect(calls("/api/v1/me/profile-fields", "PATCH")).toHaveLength(0);
}, 20_000);

it("returns to the first step with a field error when the username is already taken", async () => {
  mocks.api.mockImplementation(async ({ path }: ApiRequest) => {
    if (path === "/api/v1/me/onboarding") throw new ApiError(409, { status: 409, title: "USERNAME_TAKEN", code: "USERNAME_TAKEN", detail: "This username is already taken." } as never);
    return { data: {} };
  });
  setup("Coach");
  await account();
  // Every extra step is optional for a coach: continue through all of them empty.
  for (const title of ["Heart rate and recovery", "Your training", "Health and goals"]) {
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(title);
  }
  await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  expect(await screen.findByText("This username is already taken.")).toBeInTheDocument();
  expect(screen.getByLabelText(/^Username/)).toHaveValue("new_client");
}, 20_000);

it("skips a step without saving what was typed in it", async () => {
  setup("Coach");
  await account();
  await userEvent.type(screen.getByLabelText(/^Weight/), "80");
  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByText("Heart rate and recovery");
  await userEvent.type(screen.getByLabelText(/^Maximum heart rate/), "500");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  // Out of range: the step stays until it is fixed or skipped.
  expect(await screen.findByText("Enter a value between 100 and 230 bpm.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByText("Your training");
  await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  await screen.findByText("Health and goals");
  await userEvent.type(screen.getByLabelText(/^Goals and other notes/), "First meet in June");
  await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Signed in");
  expect(calls("/api/v1/me/profile-fields", "PATCH")[0]!.json).toEqual({ values: { AdditionalNotes: "First meet in June" } });
}, 20_000);

it("explains reserved usernames before calling the API", async () => {
  setup("Client");
  await userEvent.type(screen.getByLabelText(/^Username/), "Support");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("This username is reserved. Choose another one.")).toBeInTheDocument();
  expect(mocks.api).not.toHaveBeenCalled();
});
