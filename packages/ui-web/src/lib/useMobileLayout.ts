import { useCallback, useSyncExternalStore } from "react";
import { useUI } from "../UIProvider";
const getServerSnapshot = () => false;
/** Stable hydration; each provider owns its media query, including portal consumers. */
export function useMobileLayout() {
  const { mobileMaxWidth } = useUI();
  const query = `(max-width: ${mobileMaxWidth}px)`;
  const subscribe = useCallback(
    (changed: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, getServerSnapshot);
}
