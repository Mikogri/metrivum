import { useEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAccessibilityPreferences } from "../system";
import { motion } from "../theme";

/**
 * Android has no backdrop material for a sheet, so the app behind an open sheet is blurred
 * instead (a real render effect, Android 12+). The sheet itself is then translucent. Older Android
 * keeps an opaque sheet and no blur. iOS uses the system sheet material and needs none of this.
 */
export const canBlurBackdrop =
  Platform.OS === "android" && Number(Platform.Version) >= 31;

const radius = 10;
let visible = 0;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Called by the native sheet adapter while its sheet is on screen. */
export function useSheetPresence(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    visible += 1;
    publish();
    return () => {
      visible -= 1;
      publish();
    };
  }, [shown]);
}

/** Wrap the app content once at the root: it blurs while any sheet is open. */
export function SheetBackdrop({ children }: PropsWithChildren) {
  const active = useSyncExternalStore(subscribe, () => visible > 0);
  const { reduceTransparency } = useAccessibilityPreferences();
  const amount = useSharedValue(0);
  useEffect(() => {
    amount.value = withTiming(active && !reduceTransparency ? radius : 0, {
      duration: motion.duration.base,
    });
  }, [active, reduceTransparency, amount]);
  const blurred = useAnimatedStyle(() => ({
    filter: [{ blur: amount.value }],
  }));
  if (!canBlurBackdrop) return <>{children}</>;
  return (
    <Animated.View style={[{ flex: 1 }, blurred]}>{children}</Animated.View>
  );
}
