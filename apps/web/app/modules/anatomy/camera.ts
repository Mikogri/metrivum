/**
 * Camera framing for the anatomy viewer, kept free of WebGL so it can be tested. Positions use the
 * viewer's world space: Y up, the model faces +Z.
 */
export type Vec3 = [number, number, number];
export type CameraView = "front" | "back" | "left" | "right";

const DIRECTIONS: Record<CameraView, Vec3> = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };

/** Distance at which a box of this size fits a perspective camera, with a margin around it. */
export function fitDistance(size: Vec3, fovDegrees: number, aspect: number, margin = 1.12): number {
  const vertical = (fovDegrees * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.1));
  const height = size[1] / 2 / Math.tan(vertical / 2);
  const width = Math.max(size[0], size[2]) / 2 / Math.tan(horizontal / 2);
  // Half the depth keeps the near side of the model from pushing into the frame edge.
  return (Math.max(height, width) + Math.max(size[0], size[2]) / 2) * margin;
}

/** Where the camera stands to look at `center` from a named side. */
export function viewPosition(view: CameraView, center: Vec3, distance: number): Vec3 {
  const d = DIRECTIONS[view];
  return [center[0] + d[0] * distance, center[1] + d[1] * distance, center[2] + d[2] * distance];
}

/** Keeps the orbit target inside the model's box (plus a margin) so panning cannot lose the model. */
export function clampTarget(target: Vec3, min: Vec3, max: Vec3, margin = 0.1): Vec3 {
  return target.map((value, axis) => {
    const pad = (max[axis]! - min[axis]!) * margin;
    return Math.min(Math.max(value, min[axis]! - pad), max[axis]! + pad);
  }) as Vec3;
}

/** Smooth start and a soft landing for camera flights. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
