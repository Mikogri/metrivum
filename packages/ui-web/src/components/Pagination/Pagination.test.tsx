import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

const labels = { previous: "Previous", next: "Next", navigation: "Pagination", status: (p: number, n: number | null) => (n ? `Page ${p} of ${n}` : `Page ${p}`) };

describe("Pagination", () => {
  it("supports lists without a total (cursor-like APIs)", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={null} hasNextPage onPageChange={onPageChange} labels={labels} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toHaveTextContent("Page 1");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("hides itself when there is a single page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} labels={labels} />);
    expect(container).toBeEmptyDOMElement();
  });
});
