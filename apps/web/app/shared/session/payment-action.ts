import { useState } from "react";
import { useAccountContext } from "./AccountScope";

/** Store identifiers only: an uncertain payment must survive a remount or page reload. */
export function paymentAction(storage: Pick<Storage, "getItem" | "setItem">, account: string, operation: string, replacement?: string) {
  const name = `metrivum:payment-action:${JSON.stringify([account, operation])}`;
  const id = replacement ?? storage.getItem(name) ?? crypto.randomUUID();
  storage.setItem(name, id);
  return id;
}

export function usePaymentActionId(operation: string) {
  const { account: { userId: account } } = useAccountContext();
  const [, render] = useState(0);
  const key = paymentAction(window.localStorage, account, operation);
  return [key, (replacement: string) => {
    paymentAction(window.localStorage, account, operation, replacement);
    render(n => n + 1);
  }] as const;
}

/** Keep the same server quote after an ambiguous confirmation, rather than buying a new workspace. */
export function usePaymentQuote<T>(operation: string) {
  const { account: { userId: account } } = useAccountContext();
  const name = `metrivum:payment-quote:${JSON.stringify([account, operation])}`;
  const read = () => JSON.parse(window.localStorage.getItem(name) ?? "null") as T | null;
  const [stored, update] = useState(() => ({ name, value: read() }));
  const quote = stored.name === name ? stored.value : read();
  return [quote, (value: T | null) => {
    if (value === null) window.localStorage.removeItem(name);
    else window.localStorage.setItem(name, JSON.stringify(value));
    update({ name, value });
  }] as const;
}
