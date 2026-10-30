import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type * as ReactRouter from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneratorForm } from "./GeneratorScreen";
import type { GenerationOptions, GenerationPreview, GenerationRequest } from "./contracts";

const { api, navigate } = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => api, useAccountKey: () => "coach-a:account-1" }));
vi.mock("~/shared/i18n/AppLocale", () => ({ useT: () => ({}) }));
vi.mock("~/shared/lib/errorText", () => ({ errorText: (_messages: unknown, error: Error) => error.message }));
vi.mock("~/shared/access", () => ({ RequireFeature: ({ children }: { children: React.ReactNode }) => children, QuotaContextField: () => null, useQuotaContext: () => ({ teamId: undefined, usage: {} }) }));
vi.mock("react-router", async importOriginal => ({ ...await importOriginal<typeof ReactRouter>(), useNavigate: () => navigate }));

const input: GenerationRequest = { mode: "Strength", level: "Beginner", sessionMinutes: 60, cycleDays: 10, daySlots: [1], cycles: 2,
  seed: 42, equipment: [], skills: [], excludedExercises: [], priorityMuscles: [], preferredFamilies: [], progressRepetitions: false };
const options: GenerationOptions = { recipeVersion: "r1", metadataVersion: "m1", datasetVersion: "d1", equipment: ["dumbbells"], skills: [], muscles: [], families: [],
  exercises: ["Dead Bug", "Bird Dog"].map((name, i) => ({ id: `exercise-${i}`, name, catalogVersion: 1, family: "trunk", role: "core", muscles: [], equipmentAnyOf: [{ allOf: [] }], minimumLevel: 0,
    requiredSkills: [], status: "candidate", reviewed: true, prescriptionMode: "reps", setupSeconds: 30, repetitionCounting: "per-side" })) };
const preview: GenerationPreview = { feasible: true, state: { input, recipeVersion: "r1", metadataVersion: "m1", datasetVersion: "d1", selectionSeed: 42, setsPerExercise: 3,
  includeAccessory: true, cardioSeconds: 600, selections: { "session-1/core": "exercise-0" }, lockedSlots: [] }, document: { schemaVersion: 1, blocks: [] },
  slots: [{ key: "session-1/core", role: "core", exerciseId: "exercise-0", name: "Dead Bug", family: "trunk", muscles: [], equipment: [], locked: false, prescription: "3 × 8–10", repetitionCounting: "per-side" }],
  durations: [{ dayNumber: 1, generalWarmupSeconds: 300, specificWarmupSeconds: 60, workSeconds: 240, restSeconds: 180, setupSeconds: 30, bufferSeconds: 180, totalSeconds: 990 }], issues: [], assumptions: ["Loads remain unfilled."] };

function setup() {
  api.mockReset(); navigate.mockReset();
  api.mockImplementation(async ({ path }: { path: string }) => ({ data: path.endsWith("options") ? options : path.endsWith("save-draft") ? { id: "saved-plan" } : structuredClone(preview) }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><GeneratorForm /></MemoryRouter></QueryClientProvider>);
  return client;
}
afterEach(cleanup);

describe("generator workflow", () => {
  it("previews without a write, then saves a normal draft and navigates to the existing builder", async () => {
    const client = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Preview program" }));
    await screen.findByRole("heading", { name: "Preview · Strength" });
    expect(api.mock.calls.some(([r]) => r.path.endsWith("save-draft"))).toBe(false);
    expect(client.getQueryCache().getAll()[0]!.queryKey).toEqual(["coach-a:account-1", "training", "generator", "options"]);
    await userEvent.click(screen.getByRole("button", { name: "Save draft and open builder" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/app/programs/saved-plan/edit"));
    const request = api.mock.calls.find(([r]) => r.path.endsWith("save-draft"))![0];
    expect(request.json.state).toEqual(preview.state);
    expect(request.idempotencyKey).toBeTruthy();
    expect(api.mock.calls.some(([r]) => /assignments|revisions/.test(r.path))).toBe(false);
  });

  it("locks a slot, forwards the lock during reshuffle, and blocks saving changed form settings", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Preview program" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Lock Dead Bug on day 1" }));
    expect(screen.getByRole("button", { name: "Replace exercise" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reshuffle unlocked exercises" }));
    await waitFor(() => expect(api.mock.calls.find(([r]) => r.path.endsWith("reshuffle"))?.[0].json.state.lockedSlots).toEqual(["session-1/core"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate structure" })).not.toHaveAttribute("data-disabled"));
    await userEvent.click(screen.getByRole("button", { name: "Thursday" }));
    expect(screen.getByRole("button", { name: "Save draft and open builder" })).toBeDisabled();
  });

  it("shows unsatisfied constraints without a save button", async () => {
    setup();
    api.mockImplementation(async ({ path }: { path: string }) => ({ data: path.endsWith("options") ? options : { feasible: false, state: null, document: null,
      slots: [], durations: [], assumptions: [], issues: [{ code: "TIME_BUDGET", target: "sessionMinutes", message: "Minimum recipe needs more time." }] } }));
    await userEvent.click(await screen.findByRole("button", { name: "Preview program" }));
    await screen.findByText("TIME_BUDGET: Minimum recipe needs more time.");
    expect(screen.queryByRole("button", { name: "Save draft and open builder" })).toBeNull();
  });
});
