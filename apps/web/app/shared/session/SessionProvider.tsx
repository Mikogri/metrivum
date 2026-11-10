import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  sessionManager,
  type SessionManager,
  type SessionState,
  type SignedInAccount,
} from "./manager";

const ManagerContext = createContext<SessionManager | null>(null);

export function SessionProvider({
  children,
  manager = sessionManager(),
}: {
  children: ReactNode;
  manager?: SessionManager;
}) {
  useEffect(() => {
    void manager.start();
  }, [manager]);
  // Accounts deleted elsewhere disappear when the tab comes back into view, and at the latest after five minutes.
  useEffect(() => {
    let last = Date.now();
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000)
        return;
      last = Date.now();
      void manager.revalidate?.();
    };
    const timer = window.setInterval(() => {
      last = 0;
      check();
    }, 5 * 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [manager]);
  return (
    <ManagerContext.Provider value={manager}>
      {children}
    </ManagerContext.Provider>
  );
}

export function useSessionManager(): SessionManager {
  const manager = useContext(ManagerContext);
  if (!manager)
    throw new Error("useSessionManager must be used inside <SessionProvider>.");
  return manager;
}

const loadingState: SessionState = {
  phase: "loading",
  accounts: [],
  activeSlot: null,
  generation: 0,
};

export function useSessionState(): SessionState {
  const manager = useSessionManager();
  return useSyncExternalStore(
    manager.subscribe,
    manager.getState,
    () => loadingState,
  );
}

export function useActiveAccount(): SignedInAccount | null {
  const state = useSessionState();
  return state.accounts.find((a) => a.slot === state.activeSlot) ?? null;
}
