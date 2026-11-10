import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Reduce Motion / Reduce Transparency. Starts from the restrictive value so nothing animates or
 * turns translucent for a frame before the real setting is known.
 */
export function useAccessibilityPreferences() {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (active) setReduceTransparency(value);
      })
      .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const transparency = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      active = false;
      motion.remove();
      transparency.remove();
    };
  }, []);
  return { reduceMotion, reduceTransparency };
}

/**
 * Haptics for meaningful confirmations only (a completed set, a save, a destructive confirm,
 * a choice in a sheet). Never call these per keystroke. Failures are ignored: a device without a
 * taptic engine must not break the action.
 */
export const haptic = {
  selection: () => void Haptics.selectionAsync().catch(() => {}),
  success: () =>
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {}),
  warning: () =>
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {}),
  /** A set checked off, a toggle confirmed. */
  confirm: () =>
    void (
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    ).catch(() => {}),
};
