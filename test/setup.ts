import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

if (!globalThis.crypto?.randomUUID) {
  // jsdom without WebCrypto: deterministic enough for tests.
  let n = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    },
  });
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
