import { useEffect } from "react";

/**
 * Screens with unsaved work register here. Account switching, sign-out and in-app navigation
 * consult the registry before discarding state.
 */
type Guard = () => boolean;
const guards = new Set<Guard>();

export function hasUnsavedWork(): boolean {
  for (const guard of guards) if (guard()) return true;
  return false;
}

export function useUnsavedWorkGuard(isDirty: () => boolean) {
  useEffect(() => {
    guards.add(isDirty);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty()) {
        event.preventDefault();
        // Legacy browsers need returnValue set to show the native prompt.
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      guards.delete(isDirty);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty]);
}
