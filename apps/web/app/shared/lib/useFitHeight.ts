import { useLayoutEffect, useRef, useState, type DependencyList } from "react";

/**
 * Height from an element's resting top to the bottom of the page's scroll area (minus the containers' bottom padding, at least `gap`), so a
 * panel can fill the window without the page scrolling. Re-measures when the scroll area resizes.
 */
export function useFitHeight<T extends HTMLElement>(deps: DependencyList, gap = 24) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const scroller = element.closest("main") ?? document.documentElement;
    const measure = () => {
      const top = element.getBoundingClientRect().top + scroller.scrollTop - scroller.getBoundingClientRect().top;
      // Bottom padding of the containers in between (the page's own spacing) also has to fit.
      let below = 0;
      for (let node = element.parentElement; node && node !== scroller; node = node.parentElement) {
        const style = getComputedStyle(node);
        below += parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
      }
      setHeight(Math.max(scroller.clientHeight - top - Math.max(below, gap), 0));
    };
    measure();
    // Content above (a header that loads late, a banner) can move the element down after mount.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ref, height };
}
