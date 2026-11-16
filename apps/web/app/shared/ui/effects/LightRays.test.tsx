import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import * as controls from "@portable-ui/react";
import { LightRays } from "./LightRays";

afterEach(() => vi.restoreAllMocks());
it("keeps the decorative effect in the application rather than the control library", () => {
  expect(controls).not.toHaveProperty("LightRays");
  const html = renderToString(<LightRays className="page-light" />);
  expect(html).toContain("page-light");
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("<canvas");
});
it("retains the page geometry and safely falls back when WebGL2 is unavailable", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const view = render(<LightRays className="page-light" />);
  expect(view.container.firstElementChild).toHaveClass("page-light");
  expect(view.container.firstElementChild).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  view.unmount();
});
