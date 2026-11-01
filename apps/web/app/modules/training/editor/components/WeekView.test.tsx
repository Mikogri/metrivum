import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TrainingDocument } from "@metrivum/api-client-web";
import type { EditorApi } from "../useEditor";
import { WeekView } from "./WeekView";

vi.mock("../../queries", () => ({ useBuiltInFormulas: () => ({ data: [] }), useFormulaList: () => ({ data: { items: [] } }) }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ accountKey: "0:one", lifecycle: { isCurrent: () => true } }), useApi: () => vi.fn(), useAccountKey: () => "0:one" }));

const empty: TrainingDocument = { schemaVersion: 1, blocks: [] } as unknown as TrainingDocument;

function Harness({ pro, onDoc }: { pro: boolean; onDoc: (doc: TrainingDocument) => void }) {
  const [doc, setDoc] = useState(empty);
  const apply = (fn: (d: TrainingDocument) => TrainingDocument) => setDoc((current) => { const next = fn(current); onDoc(next); return next; });
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } }));
  return (
    <QueryClientProvider client={client}>
      <WeekView doc={doc} apply={apply} names={new Map()}
        pro={pro ? { editor: { doc, apply } as unknown as EditorApi, advancedAllowed: true, customFormulas: true, onEditNode: () => undefined } : undefined} />
    </QueryClientProvider>
  );
}

describe("table mode", () => {
  it("lets Pro add cycles and blocks from the table", () => {
    let doc = empty;
    render(<Harness pro onDoc={(next) => { doc = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Cycle" }));
    expect(doc.blocks).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cycle" }));
    expect(doc.blocks[0]!.cycles).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(doc.blocks).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Plan structure" })).toBeTruthy();
  });

  it("keeps the basic table without the advanced builder", () => {
    render(<Harness pro={false} onDoc={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Plan structure" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Block" })).toBeNull();
  });
});
