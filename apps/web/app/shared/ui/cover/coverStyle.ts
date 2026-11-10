import {
  BACKGROUNDS,
  type BackgroundEntry,
  type BackgroundParam,
} from "./backgrounds/catalog";

/**
 * What a person saves for their cover: a React Bits background, the settings they changed and the colour of the
 * banner behind it (many backgrounds are partly transparent).
 */
export type CoverStyle = {
  background: string;
  props?: Record<string, unknown>;
  backdrop?: string;
};

const LIGHT = "#d4d4d2";
const SOFT = "#8a8a86";
const ACCENT = "#6ee7a0";
const DEEP = "#1f1f1d";

/** The banner colour when the person has not chosen one. */
export const DEFAULT_BACKDROP = "#151514";

/**
 * Starting settings per background, tuned to fill a wide, short banner clearly; most use the app's neutral palette
 * with its green accent, Grainient its own colours. Pointer reactions stay on (each background's own default).
 */
const TUNED: Record<string, Record<string, unknown>> = {
  Silk: {
    color: "#55534f",
    sheenColor: "#f4f3ef",
    speed: 2.2,
    scale: 1.1,
    noiseIntensity: 1.1,
    sheen: 0.55,
    depth: 0.6,
    glow: 0.2,
    intro: false,
  },
  Balatro: {
    color1: "#3f3f3c",
    color2: "#2f6f52",
    color3: DEEP,
    contrast: 2.6,
    lighting: 0.3,
    speed: 0.6,
    pixelSize: 1,
    intro: false,
  },
  GhostFibers: {
    glowColor: ACCENT,
    lineColor: LIGHT,
    secondaryColor: SOFT,
    speed: 0.35,
    threads: 120,
    spread: 2.2,
    volume: 1,
    scale: 0.8,
    layers: 4,
    glow: 0.8,
    vignette: 0,
    intro: false,
  },
  LiquidChrome: {
    color: "#8f8f8b",
    speed: 0.15,
    amplitude: 0.25,
    roughness: 0.35,
    exposure: 0.9,
    intro: false,
  },
  Scanner: {
    color1: "#3a3a37",
    color2: ACCENT,
    color3: LIGHT,
    speed: 0.35,
    sweepSpeed: 0.2,
    scale: 0.7,
    frequency: 3,
    bandDensity: 18,
    ripple: 0.4,
    brightness: 1.2,
    vignette: 0,
    intro: false,
  },
  LightTunnel: {
    cableColor: LIGHT,
    pulseColor: ACCENT,
    tunnelColor: SOFT,
    speed: 0.08,
    cableCount: 64,
    glow: 0.8,
    brightness: 0.9,
    intro: false,
  },
  Topography: {
    color: ACCENT,
    lineCount: 26,
    tilt: 40,
    speed: 0.2,
    glow: 0.4,
    fog: 0.4,
    intro: false,
  },
  WebThreads: {
    colors: [SOFT, ACCENT],
    coreColor: "#f4f3ef",
    threadCount: 8,
    spread: 0.3,
    brightness: 0.7,
    intro: false,
  },
  Waves: {
    lineColor: LIGHT,
    accentColor: ACCENT,
    spacing: 10,
    lineWidth: 1.3,
    amplitude: 36,
    speed: 0.7,
    intro: false,
  },
  // Taller and wider than React Bits' default so the threads fill the banner.
  Threads: {
    color: [0.83, 0.83, 0.82],
    accentColor: ACCENT,
    amplitude: 2.2,
    distance: 0.75,
    split: 0,
    fray: 0.15,
    lineCount: 120,
    thickness: 0.8,
    angle: 0,
    taper: 0.4,
    enableMouseInteraction: true,
  },
  Particles: {
    particleColors: [LIGHT, ACCENT],
    particleCount: 800,
    particleSpread: 40,
    cameraDistance: 9,
    speed: 0.08,
    particleBaseSize: 220,
    glow: 1,
    intro: false,
  },
  Lightfall: {
    colors: [LIGHT, ACCENT],
    backgroundColor: DEEP,
    speed: 0.3,
    streakCount: 5,
    density: 1,
    streakLength: 1.4,
    glow: 1.2,
    intro: false,
  },
  LineWaves: {
    color1: SOFT,
    color2: ACCENT,
    color3: LIGHT,
    speed: 0.25,
    lineCount: 140,
    lineWidth: 1.6,
    glow: 0.8,
    brightness: 1.3,
    highlight: 1.2,
    warpScale: 0.6,
    rotation: -12,
    edgeFade: 0,
    intro: false,
  },
  PrismaticBurst: {
    colors: [SOFT, ACCENT, LIGHT],
    intensity: 1.4,
    speed: 0.35,
    intro: false,
  },
  LiquidEther: {
    colors: [ACCENT, LIGHT, "#7aa2ff"],
    intensity: 4,
    persistence: 1.6,
    mouseForce: 40,
    autoDemo: true,
    autoSpeed: 0.8,
    autoIntensity: 8,
    cursorSize: 400,
  },
  MoltenMetal: {
    colors: [SOFT, ACCENT],
    coreColor: "#f4f3ef",
    speed: 0.3,
    scale: 2.5,
    glow: 2.4,
    haze: 0.4,
    brightness: 2,
    thickness: 1.4,
    intro: false,
  },
  MagnetLines: {
    lineColor: LIGHT,
    accentColor: ACCENT,
    spacing: 22,
    stretch: 1,
    fade: 0.2,
    radius: 260,
    intro: false,
  },
  Dither: {
    waveColor: [0.43, 0.9, 0.63],
    backgroundColor: [0.08, 0.08, 0.08],
    waveSpeed: 0.04,
    pixelSize: 2,
    colorNum: 4,
    intro: false,
  },
  GradientASCII: {
    colors: [DEEP, SOFT, ACCENT, LIGHT],
    shape: "horizon",
    scale: 0.35,
    cellSize: 14,
    density: 1,
    glyphOpacity: 0.85,
    gradientOpacity: 0.9,
    intro: false,
  },
  Grainient: {
    colors: ["#120b2e", "#3b1d8f", "#8b2fc9", "#ff4d8d", "#ffb36b"],
    type: "linear",
    angle: 20,
    bands: 1,
    scale: 0.9,
    speed: 0.8,
    flow: 1,
    softness: 1,
    grainAmount: 0.07,
    contrast: 1.1,
    saturation: 1.1,
    intro: false,
  },
  LetterGlitch: {
    glitchColors: ["#2b6b4f", ACCENT, LIGHT],
    baseColor: LIGHT,
    backgroundColor: DEEP,
    fontSize: 14,
    spacing: 0.55,
    density: 1,
    baseOpacity: 0.75,
    glitchAmount: 0.9,
    edgeFade: 0,
    centerFade: 0,
    intro: false,
  },
  LightPillar: {
    topColor: ACCENT,
    bottomColor: "#7aa2ff",
    intensity: 1.2,
    rotationSpeed: 0.15,
    pillarWidth: 6,
    pillarHeight: 0.8,
    pillarRotation: 90,
    glowAmount: 0.004,
    bloom: 0.7,
    intro: false,
  },
};

/** The default cover: slow grey silk. */
export const COVER_DEFAULTS: Record<string, unknown> = TUNED.Silk!;
export const DEFAULT_BACKGROUND = "Silk";
export const backgrounds = BACKGROUNDS;
export const backgroundByName = (name: string) =>
  BACKGROUNDS.find((entry) => entry.name === name);

const HEX = /^#[0-9a-f]{3,8}$/i;
const HEX6 = /^#[0-9a-f]{6}$/i;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Colours some backgrounds take as [r, g, b] from 0 to 1; the editor shows them as colour pickers. */
export const isRgb = (param: BackgroundParam) =>
  param.kind === "vector" &&
  /colou?r/i.test(param.name) &&
  Array.isArray(param.default) &&
  param.default.length === 3;
export const rgbToHex = (rgb: number[]) =>
  "#" +
  rgb
    .map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
export const hexToRgb = (hex: string) =>
  [1, 3, 5].map(
    (i) => Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 1000) / 1000,
  );

/** One stored value checked against its parameter; undefined when it does not fit (and is then left at the default). */
function clean(param: BackgroundParam, value: unknown): unknown {
  if (isRgb(param))
    return Array.isArray(value) && value.length === 3 && value.every(finite)
      ? value.map((x) => Math.min(1, Math.max(0, x)))
      : undefined;
  switch (param.kind) {
    case "number": {
      if (!finite(value)) return undefined;
      const fallback = finite(param.default) ? param.default : 0;
      const min = Math.min(param.min ?? 0, fallback);
      const max = Math.max(param.max ?? 10, fallback);
      return Math.min(max, Math.max(min, value));
    }
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "color":
      return typeof value === "string" && HEX.test(value) ? value : undefined;
    case "colors":
      return Array.isArray(value) &&
        value.length > 0 &&
        value.length <= 8 &&
        value.every((x) => typeof x === "string" && HEX.test(x))
        ? value
        : undefined;
    case "select":
      return typeof value === "string" && param.options?.includes(value)
        ? value
        : undefined;
    case "multi":
      return Array.isArray(value) &&
        value.length <= 8 &&
        value.every((x) => typeof x === "string" && param.options?.includes(x))
        ? value
        : undefined;
    case "vector":
      return Array.isArray(value) && value.length <= 4 && value.every(finite)
        ? value.map((x) => Math.min(1000, Math.max(-1000, x)))
        : undefined;
    default:
      // Free text (image URLs, words) is never taken from a saved cover.
      return undefined;
  }
}

/** Parameters a person can change: everything except free text. */
export const editableParams = (entry: BackgroundEntry) =>
  entry.params.filter((param) => param.kind !== "text");

/** Only the known, in-range settings of a saved cover. */
export function cleanProps(
  entry: BackgroundEntry,
  props: unknown,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!props || typeof props !== "object") return result;
  for (const param of editableParams(entry)) {
    const value = clean(param, (props as Record<string, unknown>)[param.name]);
    if (value !== undefined) result[param.name] = value;
  }
  return result;
}

/** Where a background starts: its tuned settings (pointer reactions on). */
const startOf = (entry: BackgroundEntry) =>
  cleanProps(entry, TUNED[entry.name] ?? {});

/** A saved cover (any shape) turned into a known background, the props to render it with and the banner colour. */
export function resolveCover(style: unknown): {
  entry: BackgroundEntry;
  props: Record<string, unknown>;
  backdrop: string;
} {
  const saved =
    style && typeof style === "object" ? (style as CoverStyle) : null;
  const entry =
    (saved && backgroundByName(saved.background)) ||
    backgroundByName(DEFAULT_BACKGROUND)!;
  const backdrop =
    typeof saved?.backdrop === "string" && HEX6.test(saved.backdrop)
      ? saved.backdrop
      : DEFAULT_BACKDROP;
  return {
    entry,
    props: { ...startOf(entry), ...cleanProps(entry, saved?.props) },
    backdrop,
  };
}

/** The settings that differ from the background's starting point, to save. */
export function changedProps(
  entry: BackgroundEntry,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const base = startOf(entry);
  const defaults = Object.fromEntries(
    entry.params.map((param) => [param.name, param.default]),
  );
  return Object.fromEntries(
    Object.entries(cleanProps(entry, props)).filter(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(key in base ? base[key] : defaults[key]),
    ),
  );
}
