import { useNavigate } from "react-router";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import type { SlotId } from "~/shared/session/storage-keys";
import styles from "./AddAccountSwitch.module.css";

/** When adding an account: sign in to an existing one or create a new one, in the same free slot. */
export function AddAccountSwitch({ current, slot }: { current: "login" | "register"; slot: SlotId }) {
  const m = useT();
  const navigate = useNavigate();
  return (
    <SegmentedControl
      aria-label={m.accounts.addChoiceTitle}
      className={styles.switch}
      selectedKeys={[current]}
      onSelectionChange={(keys) => {
        const key = [...keys][0];
        if (key && key !== current) navigate(`/auth/${key === "login" ? "login" : "register"}?slot=${slot}&add=1`, { replace: true });
      }}
    >
      <Segment id="login">{m.auth.login.signInTab}</Segment>
      <Segment id="register">{m.auth.login.createTab}</Segment>
    </SegmentedControl>
  );
}
