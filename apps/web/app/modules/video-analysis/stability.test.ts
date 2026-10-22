import { expect, it } from 'vitest';
import { backgroundShift, UNSTABLE_SHIFT } from './stability';

const W = 160;
const H = 120;
/** A textured "gym background" with a lifter (changing) in the middle. */
function frame(dx: number, dy: number, lifter: number) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x - dx; const sy = y - dy;
    out[y * W + x] = ((Math.sin(sx * 0.7) + Math.cos(sy * 0.45) + Math.sin((sx + sy) * 0.23)) + 3) * 20;
    if (x > W * 0.3 && x < W * 0.7 && y > H * 0.2) out[y * W + x] = (Math.sin(x * 0.3 + lifter) + 1) * 60;
  }
  return out;
}

it('sees no camera movement when only the lifter moves', () => {
  expect(backgroundShift(frame(0, 0, 0), frame(0, 0, 2.5), W, H)).toBeLessThan(UNSTABLE_SHIFT);
});

it('measures how far the background moved when the camera moved', () => {
  expect(backgroundShift(frame(0, 0, 0), frame(4, -3, 1), W, H)).toBeCloseTo(5, 0);
  expect(backgroundShift(frame(0, 0, 0), frame(4, -3, 1), W, H)).toBeGreaterThanOrEqual(UNSTABLE_SHIFT);
});
