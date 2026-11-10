import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type * as ThreeModule from "three";
import AnatomyViewer from "./AnatomyViewer";
import { anatomyMessages } from "./messages";

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof ThreeModule>()),
  WebGLRenderer: class {
    constructor() {
      throw new Error("WebGL unavailable");
    }
  },
}));

it("explains unsupported WebGL instead of leaving the loading indicator running", () => {
  const { container } = render(
    <AnatomyViewer
      manifest={{
        version: "bodyparts3d-4.0",
        attribution: "",
        layers: [],
        structures: [],
        mappings: [],
      }}
      categories={new Set(["muscles"])}
      selected={new Set()}
      hidden={new Set()}
      isolated={false}
      transparent={false}
      camera={{ action: "front", revision: 0 }}
      onPick={() => {}}
      messages={anatomyMessages.en}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(anatomyMessages.en.webgl);
  expect(
    screen.getByRole("button", { name: "Anatomy Data & Licenses" }),
  ).toBeInTheDocument();
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(screen.queryByText(anatomyMessages.en.loading)).toBeNull();
});
