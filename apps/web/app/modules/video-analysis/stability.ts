/**
 * A quick in-browser check whether the camera moved: a dozen frames from the chosen part are compared with the first
 * one on the edges of the picture (where the background is; the lifter is usually in the middle). If the background
 * shifts, the camera moved and the analysis needs stabilization. It is an estimate: it does not see rotation well
 * and a busy background can hide small movement.
 */

export type Stability =
  | { state: "checking" }
  | { state: "stable" | "unstable"; shift: number }
  | { state: "unknown" };

const WIDTH = 160;
const SAMPLES = 12;
const RANGE = 8;
/** Background shift (in pixels of the 160 px wide copy) above which the camera counts as moving: about 1.5 % of the width. */
export const UNSTABLE_SHIFT = 2.4;

function seek(video: HTMLVideoElement, time: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Seeking failed"));
    };
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    video.currentTime = time;
  });
}

/** Edge strength of a small grey copy of the current frame. */
function edges(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) {
  context.drawImage(video, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++)
    gray[i] =
      data[i * 4]! * 0.299 +
      data[i * 4 + 1]! * 0.587 +
      data[i * 4 + 2]! * 0.114;
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      out[i] =
        Math.abs(gray[i + 1]! - gray[i - 1]!) +
        Math.abs(gray[i + width]! - gray[i - width]!);
    }
  return out;
}

/** Best-matching shift of one rectangle of the picture between two frames ("nothing moved" unless clearly better). */
function regionShift(
  reference: Float32Array,
  frame: Float32Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  range: number,
) {
  const score = (dx: number, dy: number) => {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        sum += Math.abs(
          reference[y * width + x]! - frame[(y + dy) * width + (x + dx)]!,
        );
        count++;
      }
    return count ? sum / count : Infinity;
  };
  const still = score(0, 0);
  let best = { dx: 0, dy: 0, value: still };
  for (let dy = -range; dy <= range; dy++)
    for (let dx = -range; dx <= range; dx++) {
      const value = score(dx, dy);
      if (value < best.value) best = { dx, dy, value };
    }
  return best.value < still * 0.85 ? Math.hypot(best.dx, best.dy) : 0;
}

/**
 * How far the background moved between two frames. Each corner of the picture is matched on its own: a moving
 * camera shifts all of them, a moving lifter or bar only some, so the middle value of the four is used.
 */
export function backgroundShift(
  reference: Float32Array,
  frame: Float32Array,
  width: number,
  height: number,
  range = RANGE,
) {
  const m = range + 1;
  const w = Math.floor(width * 0.28);
  const h = Math.floor(height * 0.22);
  const corners = [
    [m, m],
    [width - m - w, m],
    [m, height - m - h],
    [width - m - w, height - m - h],
  ]
    .map(([x, y]) =>
      regionShift(reference, frame, width, x!, y!, x! + w, y! + h, range),
    )
    .sort((a, b) => a - b);
  return (corners[1]! + corners[2]!) / 2;
}

export async function measureStability(
  src: string,
  range: { start: number; end: number },
  signal: AbortSignal,
): Promise<Stability> {
  if (typeof document === "undefined") return { state: "unknown" };
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("Video failed to load")),
        { once: true },
      );
    });
    const width = WIDTH;
    const height = Math.max(
      16,
      Math.round((video.videoHeight / video.videoWidth) * WIDTH),
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { state: "unknown" };
    const end = Math.min(range.end, video.duration || range.end) - 0.05;
    const start = Math.max(0, range.start);
    if (!(end > start)) return { state: "unknown" };
    let reference: Float32Array | null = null;
    let shift = 0;
    for (let i = 0; i < SAMPLES; i++) {
      await seek(video, start + ((end - start) * i) / (SAMPLES - 1), signal);
      const frame = edges(context, video, width, height);
      if (!reference) {
        reference = frame;
        continue;
      }
      shift = Math.max(shift, backgroundShift(reference, frame, width, height));
    }
    return { state: shift >= UNSTABLE_SHIFT ? "unstable" : "stable", shift };
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: "unknown" };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
