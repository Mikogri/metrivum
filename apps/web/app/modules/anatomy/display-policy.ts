// BodyParts3D 4.0 source coordinates (Z-up, millimetres), restricted to covering skin/hair surfaces.
export const DISPLAY_MASK = { min: [-45, -216, 680], max: [45, -50, 805] } as const;

export const PERMANENTLY_HIDDEN: ReadonlySet<string> = new Set([
  "FJ2056", "FJ2208", "FJ3132", "FJ3133", "FJ3134", "FJ3148",
  "FJ3426", "FJ3496", "FJ3497", "FJ3592", "FJ3593", "FJ3637",
]);

export function hasDisplayMask(id: string) {
  return id === "FJ2810" || id === "FJ2815";
}

export function isDisplayMasked(id: string, point: { x: number; y: number; z: number }) {
  return hasDisplayMask(id) && [point.x, point.y, point.z].every((value, axis) => value >= DISPLAY_MASK.min[axis]! && value <= DISPLAY_MASK.max[axis]!);
}
