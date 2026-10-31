import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "@trainflow/ui-web";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { useAccountContext, useAccountKey, useApi } from "./AccountScope";
import { hasUnsavedWork } from "./dirty-guard";
import { initialWorkspace, routeWorkspace, twinRoute, type WorkspaceMode } from "./workspace-model";

type Workspace = { canCoach: boolean; mode: WorkspaceMode; switching: boolean; switchMode: (mode: WorkspaceMode, destination?: string) => Promise<boolean> };
const Context = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkspaceScope is required.");
  return value;
}

export function WorkspaceScope({ children, roles }: { children: ReactNode; roles: readonly string[] }) {
  const account = useAccountKey();
  const { lifecycle } = useAccountContext();
  const api = useApi();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const { confirm, dialog } = useDiscardConfirm();
  const key = `tf.workspace.${account}`;
  const [mode, setMode] = useState<WorkspaceMode>(() => {
    try { return initialWorkspace(roles, localStorage.getItem(key)); }
    catch { return initialWorkspace(roles, null); }
  });
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const switchMode: Workspace["switchMode"] = async (next, destination) => {
    if (!lifecycle.isCurrent() || busy.current || (next === "coach" && !roles.includes("Coach"))) return false;
    busy.current = true;
    try {
      if (hasUnsavedWork() && !await confirm()) return false;
      if (!lifecycle.isCurrent()) return false;
      setSwitching(true);
      setError("");
      if (next === "client" && !roles.includes("Client")) {
        await api({ method: "POST", path: "/api/v1/me/roles/client" });
        if (!lifecycle.isCurrent()) return false;
        await cache.invalidateQueries({ queryKey: [account, "me"] });
      }
      await cache.cancelQueries({ queryKey: [account, "coaching"] });
      if (!lifecycle.isCurrent()) return false;
      try { localStorage.setItem(key, next); } catch { /* Session-only mode when storage is unavailable. */ }
      // Unmount dirty editors before navigating, avoiding a second route-blocker confirmation.
      flushSync(() => setMode(next));
      navigate(destination?.startsWith("/app/") ? destination : next === "coach" ? "/app/dashboard" : "/app/my-coaches", { replace: true });
      return true;
    } catch {
      if (lifecycle.isCurrent()) setError("Could not switch workspace. Please try again.");
      return false;
    } finally { busy.current = false; setSwitching(false); }
  };
  return <Context.Provider value={{ mode, switching, switchMode, canCoach: roles.includes("Coach") }}>{error && <Alert tone="danger" title={error} />}{dialog}<div key={mode}>{children}</div></Context.Provider>;
}

export function WorkspaceRouteGuard({ children, required: explicit }: { children: ReactNode; required?: WorkspaceMode }) {
  const location = useLocation();
  const { mode, switchMode, switching, canCoach } = useWorkspace();
  const required = explicit ?? routeWorkspace(location.pathname);
  if (!required || required === mode) return children;
  // A page both workspaces have (e.g. a client's workout): open it here rather than asking to switch.
  const twin = twinRoute(location.pathname, mode);
  if (twin && twin !== location.pathname) return <Navigate to={twin + location.search} replace />;
  if (required === "coach" && !canCoach) return <Alert title="Coach workspace required">This page is available to coach accounts.</Alert>;
  return <Alert title={`Open in ${required === "coach" ? "Coach" : "Client"} workspace`} actions={<Button loading={switching} onPress={() => void switchMode(required, location.pathname + location.search)}>Switch workspace</Button>}>This page belongs to your other workspace.</Alert>;
}
