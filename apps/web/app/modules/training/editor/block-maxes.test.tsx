import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Block, TrainingDocument } from "@metrivum/api-client-web";
import { ClientFormulaContext, useClientFormulaContext } from "./client-context";
import { BlockFormulaScope } from "./block-maxes";
import { exerciseBinding, exerciseMaxAlias } from "./model/inline-formula";
import { maxesTables, withMaxesTables, effectiveBlock } from "./model/maxes";
import { BlockMaxesTable } from "./components/BlockMaxesTable";

vi.mock("../queries", () => ({ useBuiltInFormulas: () => ({ data: [] }), useFormulaList: () => ({ data: { items: [] } }) }));
vi.mock("./components/useFormulaEvaluation", () => ({ useFormulaEvaluation: () => ({ data: undefined, error: null }) }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ lifecycle: { isCurrent: () => true } }) }));
vi.mock("./components/ExerciseCells", async importOriginal => ({ ...(await importOriginal<Record<string, unknown>>()), ExerciseCell: ({ onPick, mode }: { onPick: (id: string) => void; mode: string }) => <button onClick={() => onPick("bench")}>{mode === "add" ? "Add bench" : "Pick bench"}</button> }));

describe("block maxes", () => {
  it("scopes the recorded rep max, preserves athlete singles and does not leak to another block", () => {
    const single = exerciseMaxAlias("bench"); const five = exerciseMaxAlias("bench", 5);
    function Probe({ label }: { label: string }) { const context = useClientFormulaContext(); return <output aria-label={label}>{JSON.stringify({ ...context, formula: exerciseBinding("=repMax*.8", context.variables, "bench", {}, context.exerciseMaxReps?.bench) })}</output>; }
    const block: Block = { id: "A", name: "A", description: "", cycles: [], exerciseMaxes: [{ exerciseId: "bench", reps: 5, load: { value: 90, unit: "Kg" } }] };
    render(<ClientFormulaContext.Provider value={{ variables: { [single]: { value: 100, unit: "Kg" }, [five]: { value: 80, unit: "Kg" } }, sourceVersions: { [five]: "v1" }, isStale: false }}><BlockFormulaScope block={block}><Probe label="A" /></BlockFormulaScope><Probe label="B" /></ClientFormulaContext.Provider>);
    const a = JSON.parse(screen.getByLabelText("A").textContent!);
    const b = JSON.parse(screen.getByLabelText("B").textContent!);
    expect(a.variables[single].value).toBe(100);
    expect(a.variables[five].value).toBe(90);
    expect(a.sourceVersions[five]).toBeUndefined();
    expect(a.formula.variableBindings.repMax).toBe(five);
    expect(a.blockSources).toContain(five);
    expect(b.variables[five].value).toBe(80);
  });

  it("edits compact cells and keeps disconnected data outside every block", () => {
    function Editor() {
      const [document, setDocument] = useState<TrainingDocument>({ schemaVersion: 1, blocks: [], maxesTables: [{ id: "table", blockId: null, rows: [{ exerciseId: null, reps: 1, load: null }] }] });
      return <><BlockMaxesTable table={maxesTables(document)[0]!} apply={setDocument} names={new Map()} style={{}} onPointerDown={vi.fn()} onPointerMove={vi.fn()} onPointerUp={vi.fn()} /><output aria-label="Document">{JSON.stringify(document)}</output></>;
    }
    render(<Editor />);
    fireEvent.click(screen.getByText("Pick bench"));
    for (const [label, value] of ([["Max load 1", "100 lb"], ["Max reps 1", "5"]] as const)) {
      fireEvent.click(label.startsWith("Max load") ? screen.getByRole("combobox", { name: label }) : screen.getByRole("gridcell", { name: new RegExp(label) }));
      if (label.startsWith("Max load")) fireEvent.focus(screen.getByLabelText(label));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
    }
    const document = JSON.parse(screen.getByLabelText("Document").textContent!);
    expect(document.maxesTables[0]).toMatchObject({ blockId: null, rows: [{ exerciseId: "bench", reps: 5, load: { value: 100, unit: "Lb" } }] });
    expect(screen.queryByLabelText("Connected block")).toBeNull();
  });

  it("connects, reconnects and disconnects without losing rows or leaking values", () => {
    const a: Block = { id: "A", name: "A", description: "", cycles: [] };
    const b = { ...a, id: "B" };
    const document: TrainingDocument = { schemaVersion: 1, blocks: [a, b] };
    const table = { id: "T", blockId: null as string | null, rows: [{ exerciseId: "bench", reps: 1, load: { value: 100, unit: "Kg" as const } }] };
    const disconnected = withMaxesTables(document, [table]);
    expect(effectiveBlock(disconnected, a)?.exerciseMaxes).toEqual([]);
    const connected = withMaxesTables(disconnected, [{ ...table, blockId: "A" }]);
    expect(effectiveBlock(connected, a)?.exerciseMaxes).toEqual(table.rows);
    expect(effectiveBlock(connected, b)?.exerciseMaxes).toEqual([]);
    const moved = withMaxesTables(connected, [{ ...table, blockId: "B" }]);
    expect(effectiveBlock(moved, a)?.exerciseMaxes).toEqual([]);
    expect(effectiveBlock(moved, b)?.exerciseMaxes).toEqual(table.rows);
    expect(maxesTables(withMaxesTables(moved, [table]))[0]?.rows).toEqual(table.rows);
  });
});
