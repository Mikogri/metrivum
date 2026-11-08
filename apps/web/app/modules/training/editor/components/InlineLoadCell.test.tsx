import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlinePrescriptionCell } from "./InlinePrescriptionCell";
import { InlineLoadCell } from "./InlineLoadCell";
import { inlineBinding } from "../model/inline-formula";
const { client, api } = vi.hoisted(() => ({ client: { relationshipId: "client-a" }, api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ api, lifecycle: { isCurrent: () => true } }) }));
vi.mock("../../queries", () => ({
  useBuiltInFormulas: () => ({ data: [{ key: "percentage-1rm", version: 1, definition: { inputs: { base1Rm: "Kg", percentage: "Scalar" } } }] }),
  useFormulaList: () => ({ data: { items: [{ id: "custom-rule", name: "Bench backoff", version: 2, archived: false }] } }),
}));
vi.mock("../client-context", () => ({ useClientFormulaContext: () => ({ relationshipId: client.relationshipId, variables: { maxBench1r: { value: 100, unit: "Kg" }, weight: { value: 80, unit: "Kg" } } }) }));
vi.mock("./useFormulaEvaluation", () => ({ useFormulaEvaluation: () => ({ data: { result: { value: 80, unit: "Kg" } }, error: null }) }));

function focusLoad() {
  const input = screen.getByRole("combobox", { name: "Load" });
  fireEvent.focus(input);
  return input;
}

function openSources() {
  const button = screen.queryByRole("button", { name: "Formula data sources" });
  if (button) fireEvent.click(button);
}

describe("inline load cell", () => {
  it("shows the result of a saved formula beside its mark, and opens the formula menu in one click while typing", async () => {
    const user = userEvent.setup();
    render(<InlineLoadCell prescription={{ loadFormula: { formulaId: null, builtIn: null, version: 1, inputs: {}, expression: "100 * 0.8" } }} onChange={vi.fn()} readOnly={false} label="Load" />);
    const input = screen.getByRole("combobox", { name: "Load" });
    expect(input).toHaveValue("80");
    expect(screen.getByRole("button", { name: "Formula details and editing" })).toBeInTheDocument();
    await user.click(input);
    await user.keyboard("{End}+5");
    await user.click(screen.getByRole("button", { name: "Formula data sources" }));
    expect(screen.getByText("Formula data")).toBeInTheDocument();
    expect(input).toHaveValue("=100 * 0.8+5");
  });
  it("moves the current expression and manual inputs to the side editor", async () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "=hrMax / 2" } }); openSources();
    fireEvent.change(screen.getByRole("spinbutton", { name: "hrMax manual value" }), { target: { value: "190" } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Expand formula editor" }));
    const panel = screen.getByRole("dialog", { name: "Formula · Load" });
    expect(within(panel).getByRole("combobox", { name: "Load" })).toHaveValue("=hrMax / 2");
    expect(within(panel).getByRole("spinbutton", { name: "hrMax manual value" })).toHaveValue(190);
    fireEvent.change(within(panel).getByRole("combobox", { name: "Load" }), { target: { value: "=hrMax / 3" } });
    await userEvent.setup().click(within(panel).getByRole("button", { name: "Save" }));
    expect(onChange.mock.calls[0]?.[0].loadFormula).toEqual(expect.objectContaining({ expression: "hrMax / 3", inputs: { hrMax: { value: 190, unit: "Scalar" } } }));
  });
  it("uses scalar formulas for reps without a mass selector and keeps ranges", () => {
    const onChange = vi.fn();
    render(<InlinePrescriptionCell field="Reps" prescription={{ reps: { minimum: 5, maximum: 8 } }} label="Reps" readOnly={false} onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Reps" });
    expect(input).toHaveValue("5–8");
    expect(screen.queryByRole("button", { name: /unit/ })).not.toBeInTheDocument();
    fireEvent.focus(input); fireEvent.change(input, { target: { value: "=hrMax / 20" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ expression: "hrMax / 20", outputUnit: "Scalar" }));
  });
  it("keeps the original segmented duration input for rest", () => {
    const onChange = vi.fn();
    render(<InlinePrescriptionCell field="Rest" prescription={{ rest: { value: 1, unit: "Minutes" } }} label="Rest" readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "Rest: 1:00" }));
    const minutes = screen.getByRole("spinbutton", { name: "Minutes" });
    fireEvent.keyDown(minutes, { key: "2" }); fireEvent.keyDown(minutes, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(null, { value: 120, unit: "Seconds" });
    expect(screen.queryByRole("button", { name: /Rest unit/ })).not.toBeInTheDocument();
  });
  it("flushes an unfinished formula while autocomplete is still open", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "=ROUND" } });
    fireEvent(window, new Event("training:commit-cell"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ loadFormula: expect.objectContaining({ expression: "ROUND" }) }));
  });
  it("keeps a portalled parameter input focused and editable", async () => {
    render(<InlineLoadCell prescription={{ loadFormula: { formulaId: null, builtIn: "percentage-1rm", version: 1, inputs: {} } }} onChange={vi.fn()} readOnly={false} label="Load" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Load" })); openSources();
    const parameter = screen.getByRole("spinbutton", { name: "percentage value" });
    await user.click(parameter);
    await user.type(parameter, "75");
    expect(parameter).toHaveValue(75);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("validates load independently from a missing exercise and shows its unit once", () => {
    const { container } = render(<InlineLoadCell required prescription={{ load: { minimum: { value: 100, unit: "Kg" }, maximum: { value: 100, unit: "Kg" } } }} onChange={vi.fn()} readOnly={false} label="Load" />);
    expect(container.querySelector("[data-inline-load]")).not.toHaveAttribute("data-invalid");
    expect(screen.getByRole("combobox", { name: "Load" })).toHaveValue("100");
    expect(screen.getByRole("button", { name: /Load unit/ })).toHaveTextContent("kg");
  });
  it("offers qualified body weight without duplicate legacy mass names", () => {
    render(<InlineLoadCell prescription={{}} onChange={vi.fn()} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "/body" } });
    expect(screen.getByRole("option", { name: /Body weight kg/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Body weight kg/ }));
    expect(screen.getByRole("combobox", { name: "Load" })).toHaveValue("=bodyWeight_kg");
    fireEvent.change(screen.getByRole("combobox", { name: "Load" }), { target: { value: "/weight" } });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
  it("keeps saved library formulas left aligned without the variable marker", () => {
    const { container } = render(<InlineLoadCell prescription={{ loadFormula: { formulaId: null, builtIn: "percentage-1rm", version: 1, inputs: {}, variableBindings: { base1Rm: "maxBench1r" } } }} onChange={vi.fn()} readOnly={false} label="Load" />);
    expect(container.querySelector("[data-inline-load]")).toHaveAttribute("data-expression", "true");
    expect(screen.queryByLabelText("Linked variable")).not.toBeInTheDocument();
  });
  it("uses the max-table row repetition count for repMax without changing athlete scope", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" maxReps={5} prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "/repMax_kg" } });
    fireEvent.click(screen.getByRole("option", { name: "repMax_kg" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Load" }), { key: "Enter" });
    expect(onChange.mock.calls[0]?.[0].loadFormula.variableBindings).toEqual({ repMax_kg: "exercise5Rm_exercisea" });
  });
  it("shows compact rounding names but inserts the canonical expression", () => {
    render(<InlineLoadCell prescription={{}} onChange={vi.fn()} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "=ROUND" } });
    fireEvent.click(screen.getByRole("option", { name: "ROUND↓(…)" }));
    expect(screen.getByRole("combobox", { name: "Load" })).toHaveValue("=ROUND_TO_STEP_LOWER()");
  });
  it("reopens every built-in parameter and accepts a percentage as 80 rather than .8", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{ loadFormula: { formulaId: null, builtIn: "percentage-1rm", version: 1, inputs: { percentage: { value: .8, unit: "Scalar" } }, variableBindings: { base1Rm: "exercise1Rm_exercisea" } } }} onChange={onChange} readOnly={false} label="Load" />);
    focusLoad(); openSources();
    expect(screen.getByRole("button", { name: /base1Rm source/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "percentage value" })).toHaveValue(80);
    fireEvent.change(screen.getByRole("spinbutton", { name: "percentage value" }), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange.mock.calls[0]?.[0].loadFormula.inputs.percentage.value).toBe(.75);
  });
  it("uses the shared load menu to clear an entered weight", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{ load: { minimum: { value: 100, unit: "Kg" }, maximum: { value: 100, unit: "Kg" } } }} onChange={onChange} readOnly={false} label="Load" />);
    fireEvent.contextMenu(screen.getByRole("combobox", { name: "Load" }));
    expect(screen.getByText("Entered manually")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange.mock.calls[0]?.[0].load).toBeNull();
  });
  it("keeps the source inspector closed until explicitly opened", () => {
    render(<InlineLoadCell prescription={{ loadFormula: inlineBinding("=80/2", {}) }} readOnly={false} label="Load" onChange={vi.fn()} />);
    focusLoad();
    expect(screen.queryByRole("button", { name: "Close variable options" })).not.toBeInTheDocument();
    openSources();
    expect(screen.getByText("A plain expression, no variables")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close variable options" })).toBeInTheDocument();
  });
  it("edits athlete and manually entered sources without persisting resolved values as bindings", async () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{ loadFormula: { formulaId: null, builtIn: null, version: 1, expression: "weight * .8", inputs: {}, variableBindings: { weight: "weight" } } }} readOnly={false} label="Load" onChange={onChange} />);
    focusLoad();
    const source = (openSources(), screen.getByRole("button", { name: /weight source/ }));
    expect(source).toHaveTextContent("From athlete");
    await userEvent.setup().click(source);
    await userEvent.setup().click(screen.getByRole("option", { name: "Entered manually" }));
    fireEvent.change((openSources(), screen.getByRole("spinbutton", { name: "weight manual value" })), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange.mock.calls[0]?.[0].loadFormula.inputs).toEqual({ weight: { value: 90, unit: "Kg" } });
    expect(onChange.mock.calls[0]?.[0].loadFormula.variableBindings).toEqual({});
  });
  it("cancels a manual edit by mouse without blur committing it first", async () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    const input = screen.getByRole("combobox", { name: "Load" });
    await userEvent.setup().click(input);
    fireEvent.change(input, { target: { value: "=oneRepMax * .8" } });
    await userEvent.setup().type((openSources(), screen.getByRole("spinbutton", { name: "oneRepMax manual value" })), "100");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("explicitly keeps an unresolved variable and closes missing data", async () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "=oneRepMax * .8" } });
    // While typing, the formula mark is the button that opens the formula's data.
    expect(screen.getByRole("button", { name: "Formula data sources" })).toBeInTheDocument();
    await userEvent.setup().click((openSources(), screen.getByRole("button", { name: "Keep variable" })));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].loadFormula.variableBindings.oneRepMax).toBe("exercise1Rm_exercisea");
    expect(onChange.mock.calls[0]?.[0].loadFormula.inputs).toEqual({});
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("can close missing data without supplying a number and retain the active variable", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "=oneRepMax * .8" } });
    openSources();
    fireEvent.click(screen.getByRole("button", { name: "Close variable options" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("suggests variables inside functions without a slash", () => {
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{}} onChange={vi.fn()} readOnly={false} label="Load" />);
    fireEvent.change(focusLoad(), { target: { value: "=MAX(oneR", selectionStart: 9 } });
    expect(screen.getByRole("option", { name: "oneRepMax_kg" })).toBeInTheDocument();
  });
  it("offers missing 1RM under slash, keeps the variable and allows a manual replacement", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell exerciseId="exercise-a" prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "/" } });
    expect(screen.queryByRole("option", { name: "MIN(…)" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "oneRepMax_kg" }));
    expect(input).toHaveValue("=oneRepMax_kg");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange.mock.calls[0]?.[0].loadFormula.variableBindings).toEqual({ oneRepMax_kg: "exercise1Rm_exercisea" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "=oneRepMax * 80%" } });
    fireEvent.change((openSources(), screen.getByRole("spinbutton", { name: "oneRepMax manual value" })), { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange.mock.calls[1]?.[0].loadFormula.inputs.oneRepMax.value).toBe(100);
    expect(onChange.mock.calls[1]?.[0].loadFormula.variableBindings).toEqual({});
  });
  it("keeps the same native input in the actual cell, showing a result off focus and raw text on focus", () => {
    const { container } = render(<InlineLoadCell prescription={{ loadFormula: inlineBinding("=maxBench1r * 80%", { maxBench1r: { value: 100, unit: "Kg" } }) }} onChange={vi.fn()} readOnly={false} label="Load" />);
    const input = screen.getByRole("combobox", { name: "Load" });
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveValue("80");
    fireEvent.focus(input);
    expect(screen.getByRole("combobox", { name: "Load" })).toBe(input);
    expect(input).toHaveValue("=maxBench1r * 80%");
    expect(container.querySelector("[data-inline-load]")).toContainElement(input);
    expect(input.closest("[data-no-drag]")).not.toHaveStyle({ position: "fixed" });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(input).toHaveValue("80");
  });
  it("preserves normal expression-name autocomplete", () => {
    render(<InlineLoadCell prescription={{}} onChange={vi.fn()} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "=maxB", selectionStart: 5 } });
    expect(screen.getByRole("option", { name: "maxBench1r_kg" })).toHaveTextContent("maxBench1r");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("=maxBench1r_kg");
  });
  it("inserts a clicked slash variable without committing or detaching the input", async () => {
    const onChange = vi.fn();
    const { container } = render(<InlineLoadCell prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "/maxB" } });
    const option = screen.getByRole("option", { name: "maxBench1r_kg" });
    expect(container).not.toContainElement(option);
    const user = userEvent.setup();
    await user.click(option);
    expect(input).toHaveValue("=maxBench1r_kg");
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("[data-inline-load]")).toContainElement(input);
  });
  it("inserts a math helper with the caret inside parentheses and keeps arithmetic slash as division", async () => {
    render(<InlineLoadCell prescription={{}} onChange={vi.fn()} readOnly={false} label="Load" />);
    const input = focusLoad() as HTMLInputElement;
    fireEvent.change(input, { target: { value: "=MIN" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("=MIN()");
    await vi.waitFor(() => expect(input.selectionStart).toBe(5));
    fireEvent.change(input, { target: { value: "=80 / 2", selectionStart: 7 } });
    expect(screen.queryByRole("option", { name: "maxBench1r_kg" })).not.toBeInTheDocument();
  });
  it("commits an expression ending in a number without inserting an unsolicited unit", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{}} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "=maxBench1r * 0.8", selectionStart: 17 } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].loadFormula.expression).toBe("maxBench1r * 0.8");
  });
  it("preserves literal ranges and commits once when leaving the cell", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{ loadFormula: inlineBinding("=80/2", {}) }} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "40–50 kg" } });
    fireEvent.blur(input, { relatedTarget: document.body });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ loadUnit: "Kg", load: { minimum: { value: 40, unit: "Kg" }, maximum: { value: 50, unit: "Kg" } } });
  });
  it("preserves RPE and RIR effort meaning for bare numeric edits", () => {
    const onChange = vi.fn();
    render(<InlineLoadCell prescription={{ rir: 2 }} effortAsLoad fallbackValue="RIR 2" formulaAllowed={false} onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ rpe: null, rir: 3 });
  });
  it("selects a clickable saved rule and prompts blank inputs in a separate auxiliary popup", async () => {
    api.mockResolvedValue({ data: { name: "Bench backoff", definition: { inputs: { base1Rm: "Kg", percentage: "Scalar" } } }, version: 2 });
    const onChange = vi.fn();
    const { container } = render(<InlineLoadCell prescription={{}} customAllowed onChange={onChange} readOnly={false} label="Load" />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "=Bench" } });
    await userEvent.setup().click(screen.getByRole("option", { name: "Bench backoff" }));
    const source = (openSources(), await screen.findByRole("button", { name: /base1Rm source/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(container).not.toContainElement(source);
    expect(container).toContainElement(input);
    expect(input).toHaveValue("=Bench backoff");
    const numbers = screen.getAllByRole("spinbutton");
    expect(numbers[0]).toHaveValue(null);
    expect(numbers[1]).toHaveValue(null);
    fireEvent.blur(input, { relatedTarget: source });
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.setup().click(source);
    await userEvent.setup().click(screen.getByRole("option", { name: "maxBench1r" }));
    fireEvent.change(numbers[1]!, { target: { value: "0.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ loadFormula: { formulaId: "custom-rule", builtIn: null, version: 2, inputs: { percentage: { value: 0.8, unit: "Scalar" } }, variableBindings: { base1Rm: "maxBench1r" } } });
  });
  it("cancels without committing and closes auxiliary UI on client switching", () => {
    const onChange = vi.fn();
    const props = { prescription: { loadFormula: inlineBinding("=80/2", {}) }, onChange, readOnly: false, label: "Load" };
    const { rerender } = render(<InlineLoadCell {...props} />);
    const input = focusLoad();
    fireEvent.change(input, { target: { value: "=50" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("80");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "/" } });
    client.relationshipId = "client-b";
    rerender(<InlineLoadCell {...props} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    client.relationshipId = "client-a";
  });
});

it("accepts AMRAP directly in repetitions without a slash", () => {
  const maximum = vi.fn();
  render(<InlinePrescriptionCell field="Reps" prescription={{}} onMaximumChange={maximum} label="Reps" readOnly={false} onChange={vi.fn()} />);
  const input = screen.getByRole("combobox", { name: "Reps" });
  fireEvent.focus(input); fireEvent.change(input, { target: { value: "amrap" } }); fireEvent.keyDown(input, { key: "Enter" });
  expect(maximum).toHaveBeenCalledWith(true);
});
it("offers maximum duration through slash without evaluating a formula", () => {
  const maximum = vi.fn();
  render(<InlinePrescriptionCell field="WorkTime" prescription={{}} onMaximumChange={maximum} label="Time" readOnly={false} onChange={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole("gridcell"), { key: "/" });
  fireEvent.click(screen.getByRole("option", { name: "MAX" }));
  expect(maximum).toHaveBeenCalledWith(true);
});

it("does not apply maximum work time to rest", () => {
  render(<InlinePrescriptionCell field="Rest" prescription={{ workTimeMax: true, rest: { value: 60, unit: "Seconds" } }} label="Rest" readOnly={false} onChange={vi.fn()} />);
  expect(screen.getByRole("gridcell", { name: "Rest: 1:00" })).toBeInTheDocument();
  expect(screen.queryByDisplayValue("MAX")).not.toBeInTheDocument();
});
