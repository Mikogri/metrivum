import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SpecularEdge } from "./SpecularEdge";

afterEach(() => vi.restoreAllMocks());

it("wraps the control without changing it and keeps the light decorative", () => {
  const html = renderToString(
    <SpecularEdge>
      <a href="/auth/register">Create account</a>
    </SpecularEdge>,
  );
  expect(html).toContain('href="/auth/register"');
  expect(html).toMatch(/<canvas[^>]*aria-hidden="true"/);
});

it("leaves the control usable when WebGL2 is unavailable", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const view = render(
    <SpecularEdge>
      <button type="button">Go</button>
    </SpecularEdge>,
  );
  expect(view.getByRole("button", { name: "Go" })).toBeInTheDocument();
  view.unmount();
});
