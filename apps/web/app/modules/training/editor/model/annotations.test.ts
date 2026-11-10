import { describe, expect, it } from "vitest";
import type { TrainingDocument } from "@metrivum/api-client-web";
import { cloneWithNewIds, removeNode, newBlock, newCycle } from "./document";
describe("plan annotation connections", () => {
  const block = { ...newBlock("Block"), cycles: [newCycle("Cycle")] };
  const document: TrainingDocument = {
    schemaVersion: 1,
    blocks: [block],
    annotations: [
      {
        id: crypto.randomUUID(),
        kind: "Goal",
        title: "Goal",
        content: "Keep this",
        visibility: "Coach",
        targetId: block.cycles[0]!.id,
      },
    ],
  };
  it("detaches notes when a cycle disappears without deleting their text or privacy", () => {
    expect(removeNode(document, block.cycles[0]!.id).annotations?.[0]).toEqual({
      ...document.annotations![0],
      targetId: null,
    });
  });
  it("detaches annotations for nested cycles when deleting the owning block", () => {
    const next = removeNode(document, block.id);
    expect(next.blocks).toEqual([]);
    expect(next.annotations?.[0]!.targetId).toBeNull();
  });
  it("copies annotation identifiers and internal connections together", () => {
    const copy = cloneWithNewIds(document);
    expect(copy.annotations?.[0]!.id).not.toBe(document.annotations![0]!.id);
    expect(copy.annotations?.[0]!.targetId).toBe(copy.blocks[0]!.cycles[0]!.id);
    expect(copy.annotations?.[0]!.visibility).toBe("Coach");
  });
});
