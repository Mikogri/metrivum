import { expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { paymentAction, usePaymentQuote } from "./payment-action";

vi.mock("./AccountScope", () => ({
  useAccountContext: () => ({ account: { userId: "quote-user" } }),
}));

it("reuses an uncertain action across callers and reloads, but separates accounts, dues and explicit attempts", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const first = paymentAction(storage, "alice", "due:1");
  expect(paymentAction({ ...storage }, "alice", "due:1")).toBe(first);
  expect(paymentAction(storage, "bob", "due:1")).not.toBe(first);
  expect(paymentAction(storage, "alice", "due:2")).not.toBe(first);
  const next = crypto.randomUUID();
  expect(paymentAction(storage, "alice", "due:1", next)).toBe(next);
  expect(paymentAction(storage, "alice", "due:1")).toBe(next);
});

it("restores the server quote after remount and clears it only on explicit completion", () => {
  const first = renderHook(() => usePaymentQuote<{ id: string }>("team-test"));
  act(() => first.result.current[1]({ id: "server-quote" }));
  first.unmount();
  const reopened = renderHook(() =>
    usePaymentQuote<{ id: string }>("team-test"),
  );
  expect(reopened.result.current[0]).toEqual({ id: "server-quote" });
  act(() => reopened.result.current[1](null));
  reopened.unmount();
  const completed = renderHook(() =>
    usePaymentQuote<{ id: string }>("team-test"),
  );
  expect(completed.result.current[0]).toBeNull();
});
