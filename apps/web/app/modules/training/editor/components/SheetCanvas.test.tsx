import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { newBlock } from "../model/document";
import { SheetCanvas, emptySheet, endsEdit, usePersistentSheet } from "./SheetCanvas";

vi.mock("../../queries", () => ({ useBuiltInFormulas: () => ({ data: [] }), useFormulaList: () => ({ data: { items: [] } }) }));

const scope = vi.hoisted(() => ({ accountKey: "0:one", current: true }));
const lifecycle = { isCurrent: () => scope.current };
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ accountKey: scope.accountKey, lifecycle }), useApi: () => vi.fn(), useAccountKey: () => scope.accountKey }));

describe("persistent sheet scope", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); scope.accountKey = "0:one"; scope.current = true; });
  afterEach(() => { vi.useRealTimers(); });

  it("loads bounded widths and keeps plan switches from writing old values", () => {
    localStorage.setItem("tf.sheet.0:one.b", JSON.stringify({ columnWidths: { 1: 240 } }));
    const { result, rerender } = renderHook(({ plan }) => usePersistentSheet(plan), { initialProps: { plan: "a" } });
    act(() => result.current[1]((s) => ({ ...s, columnWidths: { 1: 160 } })));
    const staleUpdate = result.current[1];
    rerender({ plan: "b" });
    expect(result.current[0].columnWidths).toEqual({ 1: 240 });
    act(() => staleUpdate((s) => ({ ...s, columnWidths: { 1: 300 } })));
    act(() => vi.advanceTimersByTime(350));
    expect(JSON.parse(localStorage.getItem("tf.sheet.0:one.b")!).columnWidths).toEqual({ 1: 240 });
  });

  it("separates accounts and rejects callbacks and writes after account expiry", () => {
    const { result, rerender } = renderHook(() => usePersistentSheet("plan"));
    act(() => result.current[1]((s) => ({ ...s, columnWidths: { 2: 160 } })));
    act(() => vi.advanceTimersByTime(350));
    scope.accountKey = "1:two";
    rerender();
    expect(result.current[0].columnWidths).toBeUndefined();
    act(() => result.current[1]((s) => ({ ...s, columnWidths: { 2: 200 } })));
    scope.current = false;
    act(() => vi.advanceTimersByTime(350));
    expect(localStorage.getItem("tf.sheet.1:two.plan")).toBeNull();
    expect(JSON.parse(localStorage.getItem("tf.sheet.0:one.plan")!).columnWidths).toEqual({ 2: 160 });
  });
});


describe("sheet column controls", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 0; }
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  function Canvas({ zoom = 1, editable = false }: { zoom?: number; editable?: boolean }) {
    const [sheet, setSheet] = useState(emptySheet);
    return <SheetCanvas doc={{ schemaVersion: 1, blocks: [{ ...newBlock("Block"), id: "block" }] }} sheet={sheet} onSheetChange={setSheet} names={new Map()} initialZoom={zoom} apply={editable ? () => {} : undefined} />;
  }

  it("updates card span and later column positions through keyboard resizing in previews", async () => {
    const { container, getByRole } = render(<Canvas />);
    const block = container.querySelector<HTMLElement>("[data-kind=block][data-node]")!;
    const separator = getByRole("separator", { name: "Resize column B" });
    expect(block.style.left).toBe("104px");
    expect(block.style.width).toBe("200px");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "112");
    await waitFor(() => expect(block.style.width).toBe("208px"));
    fireEvent.keyDown(separator, { key: "Home" });
    await waitFor(() => expect(block.style.width).toBe("160px"));
    fireEvent.doubleClick(separator);
    await waitFor(() => expect(block.style.width).toBe("200px"));
  });

  it("resets only the header column selected with the context menu", () => {
    const { container, getByRole } = render(<Canvas />);
    const b = getByRole("separator", { name: "Resize column B" });
    const c = getByRole("separator", { name: "Resize column C" });
    fireEvent.keyDown(b, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(c, { key: "ArrowRight" });
    fireEvent.contextMenu(container.querySelector('[data-sheet-column="1"]')!, { clientX: 120, clientY: 10 });
    fireEvent.click(getByRole("menuitem", { name: "Reset column width" }));
    expect(b).toHaveAttribute("aria-valuenow", "104");
    expect(c).toHaveAttribute("aria-valuenow", "112");
  });

  it("inverts the actual resize gesture through the current zoom", () => {
    const { getByRole } = render(<Canvas zoom={0.5} />);
    const separator = getByRole("separator", { name: "Resize column B" });
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 100, button: 0 });
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 140 });
    fireEvent.pointerUp(separator, { pointerId: 7, clientX: 140 });
    expect(separator).toHaveAttribute("aria-valuenow", "184");
  });

  it("consumes menu dismissal without dragging and permits the next fresh card gesture", () => {
    const { container, getByRole, queryByRole } = render(<Canvas editable />);
    const block = container.querySelector<HTMLElement>("[data-kind=block][data-node]")!;
    fireEvent.contextMenu(block, { clientX: 130, clientY: 90 });
    expect(getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(block, { pointerId: 8, clientX: 130, clientY: 90, button: 0 });
    expect(queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerMove(block, { pointerId: 8, clientX: 234, clientY: 90 });
    fireEvent.pointerUp(block, { pointerId: 8, clientX: 234, clientY: 90 });
    fireEvent.click(block);
    expect(block.style.left).toBe("104px");
    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
    fireEvent.pointerDown(block, { pointerId: 9, clientX: 130, clientY: 90, button: 0 });
    fireEvent.pointerMove(block, { pointerId: 9, clientX: 234, clientY: 90 });
    fireEvent.pointerUp(block, { pointerId: 9, clientX: 234, clientY: 90 });
    expect(block.style.left).toBe("208px");
  });

  it("cancels and releases a captured card gesture when a context menu opens", () => {
    const { container, getByRole } = render(<Canvas editable />);
    const block = container.querySelector<HTMLElement>("[data-kind=block][data-node]")!;
    fireEvent.pointerDown(block, { pointerId: 10, clientX: 130, clientY: 90, button: 0 });
    fireEvent.pointerMove(block, { pointerId: 10, clientX: 234, clientY: 90 });
    expect(block.style.left).toBe("208px");
    fireEvent.contextMenu(block, { clientX: 130, clientY: 90 });
    expect(block.style.left).toBe("104px");
    expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalledWith(10);
    fireEvent.keyDown(getByRole("menu"), { key: "Escape" });
    fireEvent.pointerMove(block, { pointerId: 10, clientX: 338, clientY: 90 });
    fireEvent.pointerUp(block, { pointerId: 10, clientX: 338, clientY: 90 });
    expect(block.style.left).toBe("104px");
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)("cancels %s without committing a card move", (event) => {
    const { container } = render(<Canvas editable />);
    const block = container.querySelector<HTMLElement>("[data-kind=block][data-node]")!;
    fireEvent.pointerDown(block, { pointerId: 11, clientX: 130, clientY: 90, button: 0 });
    fireEvent.pointerMove(block, { pointerId: 11, clientX: 234, clientY: 90 });
    fireEvent[event](block, { pointerId: 11 });
    fireEvent.pointerUp(block, { pointerId: 11, clientX: 234, clientY: 90 });
    expect(block.style.left).toBe("104px");
  });

});

describe("ending an edit by pressing elsewhere", () => {
  it("keeps the cell focused while its suggestion is picked, ends it anywhere else", () => {
    const sheet = document.createElement("div");
    sheet.innerHTML = '<div><input id="cell" /><ul role="listbox"><li role="option" id="pick">Squat</li></ul></div><span id="empty"></span>';
    document.body.append(sheet);
    const cell = sheet.querySelector<HTMLElement>("#cell")!;
    expect(endsEdit(sheet, cell, sheet.querySelector<HTMLElement>("#pick")!)).toBe(false);
    expect(endsEdit(sheet, cell, cell)).toBe(false);
    expect(endsEdit(sheet, cell, sheet.querySelector<HTMLElement>("#empty")!)).toBe(true);
    sheet.remove();
  });
});
