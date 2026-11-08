import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Home — Metrivum");

import { Navigate } from "react-router";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useMobileLayout } from "@metrivum/ui-web";

export default function AppIndex() {
  const { mode } = useWorkspace();
  const mobile = useMobileLayout();
  return <Navigate to={mobile ? (mode === "coach" ? "/app/today" : "/app/my-training") : mode === "coach" ? "/app/dashboard" : "/app/my-coaches"} replace />;
}
