import type { Block, ExerciseMaxesTable, TrainingDocument } from "@trainflow/api-client-web";

export type MaxesTable = ExerciseMaxesTable;
/** Legacy block-owned tables remain readable until the first table edit. */
export function maxesTables(document: TrainingDocument): MaxesTable[] {
  return [...(document.maxesTables ?? []), ...document.blocks.filter(b => b.exerciseMaxes?.length).map(b => ({ id: `maxes:${b.id}`, blockId: b.id, rows: b.exerciseMaxes! }))];
}
export function withMaxesTables(document: TrainingDocument, tables: MaxesTable[]): TrainingDocument {
  return { ...document, blocks: document.blocks.map(b => ({ ...b, exerciseMaxes: [] })), maxesTables: tables.map(t => ({ ...t, id: t.id.startsWith("maxes:") ? crypto.randomUUID() : t.id, blockId: t.blockId ?? null })) };
}
export function effectiveBlock(document: TrainingDocument, block?: Block): Block | undefined {
  return block ? { ...block, exerciseMaxes: maxesTables(document).find(t => t.blockId === block.id)?.rows ?? [] } : undefined;
}
