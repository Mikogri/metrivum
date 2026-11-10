export type OverlayAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Fixed overlays use drawable client space, excluding edge-aligned scrollbars in the app shell. */
export function overlayViewport(anchor?: Element | null) {
  let width = Math.min(
    document.documentElement.clientWidth || window.innerWidth,
    window.visualViewport?.width ?? Infinity,
  );
  let height = Math.min(
    document.documentElement.clientHeight || window.innerHeight,
    window.visualViewport?.height ?? Infinity,
  );
  for (
    let node = anchor;
    node instanceof HTMLElement;
    node = node.parentElement
  ) {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (
      /auto|scroll/.test(style.overflowY) &&
      (node.scrollHeight > node.clientHeight ||
        style.getPropertyValue("scrollbar-gutter").includes("stable")) &&
      rect.right >= width - 1 &&
      node.clientWidth > 0
    )
      width = Math.min(width, rect.left + node.clientLeft + node.clientWidth);
    if (
      /auto|scroll/.test(style.overflowX) &&
      node.scrollWidth > node.clientWidth &&
      rect.bottom >= height - 1 &&
      node.clientHeight > 0
    )
      height = Math.min(height, rect.top + node.clientTop + node.clientHeight);
  }
  return { width, height };
}

/** Flip before clamping; scrolling is needed only for content larger than the viewport. */
export function overlayPosition(
  anchor: OverlayAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 4,
) {
  const edge = 8;
  const below = viewport.height - anchor.bottom - gap - edge;
  const above = anchor.top - gap - edge;
  const top =
    size.height <= below || below >= above
      ? anchor.bottom + gap
      : anchor.top - gap - size.height;
  const left =
    anchor.left + size.width <= viewport.width - edge
      ? anchor.left
      : anchor.right - size.width;
  return {
    left: Math.max(edge, Math.min(left, viewport.width - size.width - edge)),
    top: Math.max(edge, Math.min(top, viewport.height - size.height - edge)),
  };
}
