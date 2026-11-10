import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useColorScheme, type TextStyle } from "react-native";

/**
 * Mobile design tokens. Screens never write hex values, sizes or animation parameters themselves:
 * they compose components, and components read these.
 */
const dark = {
  background: "#070708",
  surface: "#121214",
  surfaceRaised: "#1B1B1E",
  sheet: "#151517",
  border: "#232327",
  borderStrong: "#36363C",
  text: "#F5F5F6",
  mutedText: "#A0A0A8",
  subtleText: "#6E6E77",
  accent: "#F5F5F6",
  onAccent: "#0A0A0B",
  brand: "#3EE6A0",
  onBrand: "#04130C",
  success: "#4ADE9B",
  warning: "#F0B95A",
  danger: "#FF7B7B",
  info: "#8AB4FF",
  disabled: "#5C5C64",
  pressed: "rgba(255,255,255,0.07)",
  selected: "rgba(255,255,255,0.10)",
  scrim: "rgba(0,0,0,0.28)",
  /** Sheet material where the content behind it is blurred. */
  sheetGlass: "rgba(24,24,28,0.66)",
  /** Floating chrome (tab bar, toolbars) without Liquid Glass. */
  chrome: "rgba(26,26,29,0.94)",
  /** The moving thumb of a segmented control or switch track that is off. */
  thumb: "#3B3B42",
  knob: "#FFFFFF",
  successSoft: "rgba(74,222,155,0.14)",
  warningSoft: "rgba(240,185,90,0.14)",
  dangerSoft: "rgba(255,123,123,0.14)",
  infoSoft: "rgba(138,180,255,0.14)",
};
export type ThemeColors = typeof dark;
const light: ThemeColors = {
  background: "#F3F3F5",
  surface: "#FFFFFF",
  surfaceRaised: "#EFEFF2",
  sheet: "#FFFFFF",
  border: "#E2E2E7",
  borderStrong: "#C6C6CE",
  text: "#101012",
  mutedText: "#5C5C66",
  subtleText: "#8B8B95",
  accent: "#101012",
  onAccent: "#FFFFFF",
  brand: "#0C9A68",
  onBrand: "#FFFFFF",
  success: "#0B7F56",
  warning: "#8F5F00",
  danger: "#C22B2B",
  info: "#2C5FC4",
  disabled: "#A5A5AE",
  pressed: "rgba(0,0,0,0.05)",
  selected: "rgba(0,0,0,0.07)",
  scrim: "rgba(0,0,0,0.18)",
  sheetGlass: "rgba(255,255,255,0.74)",
  chrome: "rgba(255,255,255,0.95)",
  thumb: "#FFFFFF",
  knob: "#FFFFFF",
  successSoft: "rgba(11,127,86,0.10)",
  warningSoft: "rgba(143,95,0,0.10)",
  dangerSoft: "rgba(194,43,43,0.09)",
  infoSoft: "rgba(44,95,196,0.09)",
};

/** Geist (SIL OFL 1.1). The app loads these files; until then the system face is used. */
export const fonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
} as const;

const type = (
  family: string,
  fontSize: number,
  lineHeight: number,
  extra: TextStyle = {},
): TextStyle => ({ fontFamily: family, fontSize, lineHeight, ...extra });

/** Type scale. Sizes are base values; the system text-size setting scales them. */
export const typography = {
  display: type(fonts.semibold, 28, 34, { letterSpacing: -0.7 }),
  title: type(fonts.semibold, 20, 26),
  // No negative tracking below the display size: Android clips the last glyph of a
  // content-sized text that has it.
  heading: type(fonts.semibold, 16, 22),
  body: type(fonts.regular, 15, 21),
  bodyStrong: type(fonts.medium, 15, 21),
  label: type(fonts.medium, 13, 18),
  caption: type(fonts.regular, 13, 18),
  overline: type(fonts.medium, 11, 14, {
    letterSpacing: 0.9,
    textTransform: "uppercase",
  }),
  button: type(fonts.medium, 14, 18),
  /** Sets, reps, load, timers: large calm digits that do not jump as they change. */
  numeric: type(fonts.medium, 22, 28, { fontVariant: ["tabular-nums"] }),
  numericSmall: type(fonts.medium, 14, 20, { fontVariant: ["tabular-nums"] }),
} as const;
export type TextVariant = keyof typeof typography;

/** Durations in ms, easing as cubic-bezier control points, springs for Reanimated. */
export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 360 },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    out: [0.16, 1, 0.3, 1] as const,
    in: [0.4, 0, 1, 1] as const,
  },
  spring: {
    press: { damping: 22, stiffness: 420, mass: 0.6 },
    settle: { damping: 20, stiffness: 240, mass: 0.9 },
    pop: { damping: 12, stiffness: 320, mass: 0.7 },
  },
  pressScale: 0.97,
  /** Kept for existing callers. */
  short: 120,
} as const;

export const tokens = {
  spacing: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  /** Default corner radius; `radii` holds the full scale. */
  radius: 12,
  radii: { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 },
  /**
   * Row and field height. Controls are drawn smaller than this (`control`) and reach the
   * minimum touch target with hit slop. Workout controls use `touchLarge`.
   */
  touch: 44,
  touchLarge: 50,
  /** Drawn height of buttons and other compact controls. */
  control: { sm: 32, md: 40, lg: 46 },
  hairline: 1,
  typography: { body: 16, small: 13, heading: 22 },
  icon: { sm: 18, md: 22, lg: 26 },
  motion,
  elevation: 2,
  light,
  dark,
};

export type ThemeMode = "system" | "light" | "dark";
const ThemeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({ mode: "system", setMode: () => {} });

export function ThemeProvider({
  children,
  initialMode = "system",
  onModeChange,
}: PropsWithChildren<{
  initialMode?: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
}>) {
  const [mode, updateMode] = useState<ThemeMode>(initialMode);
  useEffect(() => updateMode(initialMode), [initialMode]);
  const setMode = (next: ThemeMode) => {
    updateMode(next);
    onModeChange?.(next);
  };
  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const setting = useContext(ThemeContext);
  const system = useColorScheme();
  const isDark =
    setting.mode === "dark" ||
    (setting.mode === "system" && system !== "light");
  return {
    ...tokens,
    ...setting,
    dark: isDark,
    colors: isDark ? tokens.dark : tokens.light,
    type: typography,
  };
}
export type Theme = ReturnType<typeof useTheme>;
