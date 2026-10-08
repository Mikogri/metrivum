import { UserRound, UsersRound } from "lucide-react";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import styles from "./WorkspaceSwitcher.module.css";

/** Coach / Client view toggle in the app bar. Accounts without the coach role only have the client view, so it is hidden. */
export function WorkspaceSwitcher() {
  const { mode, switchMode, switching } = useWorkspace();
  const profile = useProfile();
  if (!profile.roles.includes("Coach")) return null;
  return (
    <SegmentedControl
      size="sm"
      aria-label="Workspace view"
      className={styles.switcher}
      selectedKeys={[mode]}
      isDisabled={switching}
      onSelectionChange={(keys) => {
        const key = [...keys][0];
        if ((key === "coach" || key === "client") && key !== mode) void switchMode(key);
      }}
    >
      <Segment id="coach">
        <UsersRound aria-hidden="true" />
        <span className={styles.label}>Coach</span>
      </Segment>
      <Segment id="client">
        <UserRound aria-hidden="true" />
        <span className={styles.label}>Client</span>
      </Segment>
    </SegmentedControl>
  );
}
