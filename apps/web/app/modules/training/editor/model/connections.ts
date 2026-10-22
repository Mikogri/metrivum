import type { CSSProperties } from "react";
export type Side = "left" | "right" | "top" | "bottom";
export interface Bounds { left: number; top: number; width: number; height: number }
export interface Port { x: number; y: number; side: Side }
const normal = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] } as const;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
function port(box: Bounds, side: Side, toward: Bounds): Port {
  const insetX = Math.min(16, box.width / 2); const insetY = Math.min(16, box.height / 2);
  return { side,
    x: side === "left" ? box.left : side === "right" ? box.left + box.width : clamp(toward.left + toward.width / 2, box.left + insetX, box.left + box.width - insetX),
    y: side === "top" ? box.top : side === "bottom" ? box.top + box.height : clamp(toward.top + toward.height / 2, box.top + insetY, box.top + box.height - insetY),
  };
}
/** Only outward-facing pairs are eligible; overlapping cards use the least obstructed axis. */
export function connectBounds(source: Bounds, target: Bounds) {
  const pairs: [Side, Side][] = [["right", "left"], ["left", "right"], ["bottom", "top"], ["top", "bottom"]];
  const candidates = pairs.map(([a, b]) => {
    const from = port(source, a, target); const to = port(target, b, source);
    if (a === "top" || a === "bottom") {
      const low = Math.max(source.left + Math.min(16, source.width / 2), target.left + Math.min(16, target.width / 2));
      const high = Math.min(source.left + source.width - Math.min(16, source.width / 2), target.left + target.width - Math.min(16, target.width / 2));
      if (low <= high) from.x = to.x = (low + high) / 2;
    } else {
      const low = Math.max(source.top + Math.min(16, source.height / 2), target.top + Math.min(16, target.height / 2));
      const high = Math.min(source.top + source.height - Math.min(16, source.height / 2), target.top + target.height - Math.min(16, target.height / 2));
      if (low <= high) from.y = to.y = (low + high) / 2;
    }
    const dx = to.x - from.x; const dy = to.y - from.y; const n = normal[a];
    return { from, to, score: Math.hypot(dx, dy) + (dx * n[0] + dy * n[1] < 0 ? 100000 : 0) };
  });
  const best = candidates.reduce((a, b) => a.score <= b.score ? a : b);
  return { from: best.from, to: best.to };
}
export function cablePath(from: Port, to: Port, plug = true): string {
  const a = normal[from.side]; const b = normal[to.side];
  const end = { x: to.x + b[0] * (plug ? 9 : 0), y: to.y + b[1] * (plug ? 9 : 0) };
  const bend = Math.max(24, Math.hypot(end.x - from.x, end.y - from.y) * .4);
  return `M ${from.x} ${from.y} C ${from.x + a[0] * bend} ${from.y + a[1] * bend}, ${end.x + b[0] * bend} ${end.y + b[1] * bend}, ${end.x} ${end.y}`;
}
export const plugRotation = (side: Side) => ({ left: 0, right: 180, top: 90, bottom: -90 })[side];
export function handleStyle(port: Port, box: Bounds): CSSProperties {
  return { left: port.x - box.left, top: port.y - box.top, right: "auto", transform: `translate(-50%, -50%) rotate(${port.side === "top" || port.side === "bottom" ? 90 : 0}deg)` };
}
