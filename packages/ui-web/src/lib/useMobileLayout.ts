import { useSyncExternalStore } from "react";

const phoneQuery = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(phoneQuery).matches;
const getServerSnapshot = () => false;

/** Keeps the initial server/client render identical; CSS handles the first phone paint. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
