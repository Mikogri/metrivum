import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { InlineLoadCell } from "./InlineLoadCell";
import { WorkoutEditor } from "./WorkoutEditor";
import type { EditorApi } from "../useEditor";
import { BlockFormulaScope } from "../block-maxes";
import { effectiveBlock } from "../model/maxes";
import type {
  Block,
  TrainingDocument,
  Workout,
} from "@metrivum/api-client-web";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountContext: () => ({ api, lifecycle: { isCurrent: () => true } }),
  useApi: () => api,
  useAccountKey: () => "formula-display",
}));
vi.mock("./SetGrid", () => ({
  SetGrid: ({ workout }: { workout: Workout }) => (
    <InlineLoadCell
      prescription={workout.exercises[0]!.sets[0]!.prescription}
      exerciseId={workout.exercises[0]!.exerciseId}
      label="Load"
      readOnly={false}
      onChange={vi.fn()}
    />
  ),
}));
vi.mock("./DetailsPanel", () => ({ DetailsPanel: () => null }));
vi.mock("../../queries", () => ({
  useBuiltInFormulas: () => ({ data: [] }),
  useFormulaList: () => ({ data: { items: [] } }),
}));
beforeEach(() => {
  api.mockReset();
});
it("evaluates an MCP-style bound formula using its linked block max without selecting a client", async () => {
  const exerciseId = "bb87ab4d-cfa5-55f8-bc53-8aa300686e22";
  const block: Block = {
    id: "block",
    name: "Block",
    description: "",
    cycles: [],
  };
  const document: TrainingDocument = {
    schemaVersion: 1,
    blocks: [block],
    maxesTables: [
      {
        id: "maxes",
        blockId: block.id,
        rows: [{ exerciseId, reps: 1, load: { value: 92.5, unit: "Kg" } }],
      },
    ],
  };
  api.mockImplementation(async ({ json }) => {
    if (!json.inputs.base1Rm) throw new Error("Missing base1Rm");
    return { data: { result: { value: 67.5, unit: "Kg" } } };
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <BlockFormulaScope block={effectiveBlock(document, block)}>
        <InlineLoadCell
          prescription={{
            loadFormula: {
              version: 1,
              formulaId: null,
              builtIn: null,
              expression: "ROUND_TO_STEP_LOWER(base1Rm * 75%, 2.5)",
              inputs: {},
              variableBindings: {
                base1Rm: "exercise1Rm_bb87ab4dcfa555f8bc538aa300686e22",
              },
            },
          }}
          exerciseId={exerciseId}
          label="Load"
          readOnly={false}
          onChange={vi.fn()}
        />
      </BlockFormulaScope>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Load" })).toHaveValue("67.5"),
  );
  expect(api.mock.calls[0]![0].json.inputs.base1Rm).toEqual({
    value: 92.5,
    unit: "Kg",
  });
  cache.clear();
});

it("resolves the same MCP formula in the detailed workout editor without a caller-provided scope", async () => {
  const exerciseId = "bb87ab4d-cfa5-55f8-bc53-8aa300686e22";
  const workout = {
    id: "workout",
    name: "Workout",
    description: "",
    groups: [],
    exercises: [
      {
        id: "instance",
        exerciseId,
        comment: "",
        sets: [
          {
            id: "set",
            kind: "Standard" as const,
            prescription: {
              loadFormula: {
                formulaId: null,
                builtIn: null,
                version: 1,
                expression: "ROUND_TO_STEP_LOWER(base1Rm * 75%, 2.5)",
                inputs: {},
                variableBindings: {
                  base1Rm: "exercise1Rm_bb87ab4dcfa555f8bc538aa300686e22",
                },
              },
            },
          },
        ],
      },
    ],
  };
  const document: TrainingDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: "block",
        name: "Block",
        description: "",
        cycles: [
          {
            id: "cycle",
            name: "Cycle",
            description: "",
            dayCount: 7,
            days: [{ id: "day", dayNumber: 1, workouts: [workout] }],
          },
        ],
      },
    ],
    maxesTables: [
      {
        id: "maxes",
        blockId: "block",
        rows: [{ exerciseId, reps: 1, load: { value: 92.5, unit: "Kg" } }],
      },
    ],
  };
  api.mockImplementation(async ({ json }) => {
    if (!json.inputs.base1Rm) throw new Error("Missing input");
    return { data: { result: { value: 67.5, unit: "Kg" } } };
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <WorkoutEditor
        editor={{ doc: document } as EditorApi}
        workout={workout}
        names={new Map()}
        readOnly={false}
        advancedAllowed
        customFormulas
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Load" })).toHaveValue("67.5"),
  );
  cache.clear();
});

it("keeps manual constants fixed and shows the expression only while editing", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  api.mockResolvedValue({ data: { result: { value: 65, unit: "Kg" } } });
  const expression = "ROUND_TO_STEP_LOWER(base1Rm * 72.5%, 2.5)";
  render(
    <QueryClientProvider client={cache}>
      <InlineLoadCell
        prescription={{
          loadFormula: {
            formulaId: null,
            builtIn: null,
            version: 1,
            expression,
            inputs: { base1Rm: { value: 90, unit: "Kg" } },
            variableBindings: {},
          },
        }}
        label="Load"
        readOnly={false}
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("combobox", { name: "Load" });
  await waitFor(() => expect(input).toHaveValue("65"));
  expect(api.mock.calls[0]![0].json.inputs.base1Rm.value).toBe(90);
  fireEvent.focus(input);
  await waitFor(() => expect(input).toHaveValue(`=${expression}`));
  cache.clear();
});
