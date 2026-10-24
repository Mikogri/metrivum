import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "~/shared/http/errors";
import { ResourceError } from "./ResourceError";
import { createQueryClient } from "./queryClient";

it.each([403, 404])("conceals private resource details for %s and does not offer a retry", async status => {
  const retry = vi.fn();
  const error = new ApiError(status, { status, detail: "Secret resource exists", code: "ACCESS_DENIED" });
  render(<ResourceError error={error} retry={retry} />);
  expect(screen.getByText("This item was not found.")).toBeInTheDocument();
  expect(screen.queryByText("Secret resource exists")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  const client = createQueryClient(vi.fn());
  const request = vi.fn().mockRejectedValue(error);
  await expect(client.fetchQuery({ queryKey: ["private-item"], queryFn: request })).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
  client.clear();
});
it("retains recovery for a transient failure", () => {
  const retry = vi.fn();
  render(<ResourceError error={new NetworkError("offline")} retry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
