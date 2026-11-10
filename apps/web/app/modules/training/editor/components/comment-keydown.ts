import type { KeyboardEvent } from "react";

/** Popover comments commit with Enter; modified Enter inserts a newline without closing the menu. */
export function commentKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onClose: () => void,
  onChange: (text: string) => void,
) {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const input = event.currentTarget;
    input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end");
    onChange(input.value);
  } else onClose();
}
