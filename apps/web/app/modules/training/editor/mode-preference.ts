/** Simple or advanced plan view, remembered in this browser for the editor and the program preview. */
export type EditorMode = "simple" | "advanced";

const MODE_KEY = "tf.editor.mode";

export function storedMode(): EditorMode | null {
  try {
    const value = window.localStorage.getItem(MODE_KEY);
    return value === "simple" || value === "advanced" ? value : null;
  } catch {
    return null;
  }
}

export function storeMode(mode: EditorMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Without storage the choice lasts for this visit.
  }
}
