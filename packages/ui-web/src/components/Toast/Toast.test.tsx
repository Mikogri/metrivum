import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toaster, toast } from "./Toast";

describe("Toast", () => {
  it("announces success politely and errors assertively", () => {
    render(<Toaster label="Notifications" dismissLabel="Dismiss" />);
    act(() => {
      toast({ title: "Saved", tone: "success" });
      toast({ title: "Couldn't save", tone: "danger" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });
});
