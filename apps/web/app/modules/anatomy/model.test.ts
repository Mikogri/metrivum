import { describe, expect, it } from "vitest";
import { mappingIndex, selectedMeshIds, structureVisible, toggleSelection, type AnatomyManifest } from "./model";


const manifest = { mappings: [
  { muscleKey: "quadriceps", conceptId: "FMA1", representationId: "BP1", meshIds: ["left", "right", "other"] },
  { muscleKey: "rectus-femoris", conceptId: "FMA2", representationId: "BP2", meshIds: ["left", "right"] },
  { muscleKey: "rectus-femoris", conceptId: "FMA3", representationId: "BP3", meshIds: ["left"] },
] } as AnatomyManifest;

describe("shared anatomical selection", () => {
  it("resolves bilateral/subdivision meshes and prefers a specific muscle over a group on picking", () => {
    const index = mappingIndex(manifest);
    expect(index.byMesh.get("left")).toEqual(["rectus-femoris", "quadriceps"]);
    expect(selectedMeshIds(new Set(["rectus-femoris"]), index.byMuscle)).toEqual(new Set(["left", "right"]));
  });
  it("supports multiple selection, toggling and a selected muscle without geometry", () => {
    let selected = toggleSelection(new Set(), "quadriceps", true);
    selected = toggleSelection(selected, "unmapped", true);
    expect(selected.size).toBe(2);
    expect(selectedMeshIds(new Set(["unmapped"]), mappingIndex(manifest).byMuscle).size).toBe(0);
    expect(toggleSelection(selected, "quadriceps", true)).toEqual(new Set(["unmapped"]));
    expect(toggleSelection(selected, "new", false)).toEqual(new Set(["new"]));
  });
  it("reveals selected anatomy, hides/isolate without deleting model identities, and restores the default", () => {
    const categories = new Set<"muscles">(["muscles"]);
    expect(structureVisible("bone", "skeleton", categories, new Set(), new Set(), false)).toBe(false);
    expect(structureVisible("bone", "skeleton", categories, new Set(), new Set(["bone"]), false)).toBe(true);
    expect(structureVisible("bone", "skeleton", categories, new Set(["bone"]), new Set(["bone"]), false)).toBe(false);
    expect(structureVisible("other", "muscles", categories, new Set(), new Set(["bone"]), true)).toBe(false);
    expect(structureVisible("other", "muscles", categories, new Set(), new Set(), false)).toBe(true);
    expect(manifest.mappings).toHaveLength(3);
  });
});
