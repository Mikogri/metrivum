import { useSyncExternalStore } from "react";

/**
 * Sheet preference, remembered in this browser: whether minimising a block also hides its cycles and workouts
 * (on by default). Off, a minimised block only minimises them and they stay on the sheet.
 */
const HIDE_KEY = "tf.sheet.hideCollapsedChildren";
const EVENT = "tf:sheet-preferences";

function read(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useHideCollapsedChildren(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function setHideCollapsedChildren(hide: boolean) {
  try {
    window.localStorage.setItem(HIDE_KEY, hide ? "on" : "off");
  } catch {
    // Without storage the choice lasts for this visit only.
  }
  window.dispatchEvent(new Event(EVENT));
}
