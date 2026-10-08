import { Navigate } from "react-router";
import { useWorkspace } from "~/shared/session/WorkspaceScope";

export default function AppIndex() {
  const { mode } = useWorkspace();
  return <Navigate to={mode === "coach" ? "/app/dashboard" : "/app/my-coaches"} replace />;
}
