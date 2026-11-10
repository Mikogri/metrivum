import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import { Toaster, toast } from "@metrivum/ui-web";
import { AppLocaleProvider, useT } from "~/shared/i18n/AppLocale";
import { noIndexMeta } from "~/shared/i18n/site";
import { createQueryClient } from "~/shared/lib/queryClient";
import {
  SessionProvider,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { userInitiatedSignOuts } from "~/shared/session/signout-tracker";

// Account and app screens are not for search engines. This is a hint, not access control.
export const meta = () => noIndexMeta;

function SessionWatcher() {
  const state = useSessionState();
  const m = useT();
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (state.phase !== "ready") return;
    const current = new Set(state.accounts.map((a) => a.userId));
    if (previous.current) {
      for (const id of previous.current) {
        if (!current.has(id) && !userInitiatedSignOuts.delete(id))
          toast({ tone: "warning", title: m.accounts.expiredToast });
      }
    }
    previous.current = current;
  }, [state, m]);
  return null;
}

function ToasterHost() {
  const m = useT();
  return (
    <Toaster label={m.common.notifications} dismissLabel={m.common.dismiss} />
  );
}

export default function PrivateRoot() {
  const clientRef = useRef<ReturnType<typeof createQueryClient> | null>(null);
  const [queryClient] = useState(() => {
    const client = createQueryClient(() => {
      // A 403 FEATURE_UNAVAILABLE means our cached decision is stale: refetch it.
      void clientRef.current?.invalidateQueries({
        predicate: (query) => query.queryKey[1] === "access",
      });
    });
    clientRef.current = client;
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AppLocaleProvider>
          <SessionWatcher />
          <Outlet />
          <ToasterHost />
        </AppLocaleProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
