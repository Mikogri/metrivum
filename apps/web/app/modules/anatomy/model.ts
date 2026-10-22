export type Category = "muscles" | "skeleton" | "nervous" | "tendons" | "ligaments" | "skin" | "vascular" | "organs" | "other";
import { PERMANENTLY_HIDDEN } from "./display-policy";

export interface AnatomyStructure {
  id: string;
  conceptId: string;
  representationId: string;
  name: string;
  category: Category;
}
export interface MuscleMapping { muscleKey: string; conceptId: string; representationId: string; meshIds: string[] }
export interface AnatomyManifest {
  version: string;
  attribution: string;
  layers: { id: Category; url: string; structures: number; bytes: number }[];
  structures: AnatomyStructure[];
  mappings: MuscleMapping[];
}
export const ASSET_BASE = "/anatomy/bodyparts3d-4.0/";

export function mappingIndex(manifest: AnatomyManifest) {
  const byMuscle = new Map<string, Set<string>>();
  for (const mapping of manifest.mappings) {
    const meshes = byMuscle.get(mapping.muscleKey) ?? new Set<string>();
    for (const id of mapping.meshIds) meshes.add(id);
    byMuscle.set(mapping.muscleKey, meshes);
  }
  const byMesh = new Map<string, string[]>();
  // Prefer the most specific catalogue entry when the same mesh also belongs to an existing muscle group.
  for (const [key, ids] of [...byMuscle].sort((a, b) => a[1].size - b[1].size || a[0].localeCompare(b[0]))) {
    for (const id of ids) byMesh.set(id, [...(byMesh.get(id) ?? []), key]);
  }
  return { byMuscle, byMesh };
}

export function toggleSelection(current: Set<string>, key: string, multiple: boolean) {
  if (current.has(key)) return new Set([...current].filter(item => item !== key));
  return new Set(multiple ? [...current, key] : [key]);
}

export function selectedMeshIds(selected: Set<string>, mappings: Map<string, Set<string>>) {
  return new Set([...selected].flatMap(key => [...(mappings.get(key) ?? [])]));
}

export function structureVisible(id: string, category: Category, categories: Set<Category>, hidden: Set<string>, selected: Set<string>, isolated: boolean) {
  return !PERMANENTLY_HIDDEN.has(id) && !hidden.has(id) && (isolated ? selected.has(id) : categories.has(category) || selected.has(id));
}
