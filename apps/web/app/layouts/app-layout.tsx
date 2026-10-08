import { AccountGate, useProfile } from "~/modules/accounts";
import { WorkspaceScope } from "~/shared/session/WorkspaceScope";
import { AppShell } from "./components/AppShell";
import { MessagingProvider } from "~/modules/messaging";

function Workspace() {
  const profile = useProfile();
  return <WorkspaceScope roles={profile.roles}><MessagingProvider><AppShell /></MessagingProvider></WorkspaceScope>;
}
export default function AppLayout() {
  return <AccountGate mode="app"><Workspace /></AccountGate>;
}
