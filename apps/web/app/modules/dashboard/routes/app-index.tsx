import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Home — Metrivum");

import { Navigate } from "react-router";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useMobileLayout } from "@metrivum/ui-web";

export default function AppIndex() {
  const { mode } = useWorkspace();
  const mobile = useMobileLayout();
  return <Navigate to={mobile ? "/app/today" : mode === "coach" ? "/app/dashboard" : "/app/my-coaches"} replace />;
}
