import { useQueryClient } from "@tanstack/react-query";
import { clearToasts } from "@metrivum/ui-web";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { mockFetch } from "~/shared/dev/mockApi";
import { apiBaseUrl } from "~/shared/http/config";
import { createTransport, type Transport } from "~/shared/http/transport";
import { StaleAccountError } from "~/shared/http/errors";
import type { SignedInAccount } from "./manager";
import { useSessionManager } from "./SessionProvider";

export interface AccountContextValue {
  account: SignedInAccount;
  /** Prefix for every private query key: data of different accounts never share cache entries. */
  accountKey: string;
  api: Transport;
  lifecycle: {
    isCurrent: () => boolean;
    signal: () => AbortSignal;
    accessToken: (options?: {
      forceRefresh?: boolean;
      signal?: AbortSignal;
    }) => Promise<string | null>;
  };
}

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * Binds API access to one signed-in account. Rendered with `key={accountKey}` so switching
 * accounts remounts the whole subtree: editor state, selections and errors start fresh.
 */
export function AccountScope({
  account,
  generation,
  children,
}: {
  account: SignedInAccount;
  generation: number;
  children: ReactNode;
}) {
  const manager = useSessionManager();
  const queryClient = useQueryClient();
  const accountKey = `${account.slot}:${account.userId}`;

  // Created per mount (StrictMode-safe); aborted when this account scope unmounts.
  const controllerRef = useRef<AbortController>(new AbortController());

  const value = useMemo<AccountContextValue>(() => {
    const isCurrent = () => {
      const state = manager.getState();
      return (
        state.activeSlot === account.slot &&
        state.generation === generation &&
        !controllerRef.current.signal.aborted
      );
    };
    const lifecycle: AccountContextValue["lifecycle"] = {
      isCurrent,
      signal: () => controllerRef.current.signal,
      accessToken: async ({ forceRefresh, signal } = {}) => {
        const assertCurrent = () => {
          if (!isCurrent() || signal?.aborted) throw new StaleAccountError();
        };
        assertCurrent();
        try {
          return await manager.accessToken(
            account.slot,
            forceRefresh,
            account.userId,
          );
        } finally {
          assertCurrent();
        }
      },
    };
    const api = createTransport({
      baseUrl: MOCK_MODE ? "http://mock.trainflow.invalid" : apiBaseUrl(),
      fetchImpl: MOCK_MODE ? mockFetch : undefined,
      getAccessToken: lifecycle.accessToken,
      accountSignal: lifecycle.signal,
      isCurrent,
    });
    return { account, accountKey, api, lifecycle };
    // The session object refreshes often; identity is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, generation, manager]);

  // Re-arm before descendant query effects run during StrictMode's effect replay.
  useLayoutEffect(() => {
    if (controllerRef.current.signal.aborted)
      controllerRef.current = new AbortController();
    const controller = controllerRef.current;
    // Stop network work synchronously, before React has unmounted the previous account.
    const checkAccount = () => {
      if (!value.lifecycle.isCurrent()) controller.abort();
    };
    const unsubscribe = manager.subscribe(checkAccount);
    checkAccount();
    return () => {
      unsubscribe();
      // Leaving this account: abort its in-flight requests, polls and downloads, and drop its cache.
      controller.abort();
      clearToasts();
      void queryClient.cancelQueries({ queryKey: [accountKey] });
      queryClient.removeQueries({ queryKey: [accountKey] });
    };
  }, [queryClient, accountKey, generation, manager, value]);

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccountContext(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value)
    throw new Error("useAccountContext must be used inside <AccountScope>.");
  return value;
}

export function useApi(): Transport {
  return useAccountContext().api;
}

/** Builds a private query key namespaced by the active account. */
export function useAccountKey(): string {
  return useAccountContext().accountKey;
}
