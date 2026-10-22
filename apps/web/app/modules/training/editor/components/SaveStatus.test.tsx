import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveStatus } from "./SaveStatus";
describe("save validation status", () => {
  it("distinguishes stored invalid drafts from rejected writes", () => {
    const { rerender } = render(<SaveStatus status="saved" invalidFormat issues={["Cycle A · Bench press · Load: Missing closing parenthesis."]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved — invalid format");
    expect(screen.getByRole("status")).not.toHaveAttribute("title");
    rerender(<SaveStatus status="error" invalidFormat />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t save — invalid format");
  });
});
