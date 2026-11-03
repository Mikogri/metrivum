import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Check, ChevronsUpDown, ClipboardList, CircleUserRound } from "lucide-react";
import { Button, ListBox, ListBoxItem, Popover, Select, Text } from "react-aria-components";
import { Hint } from "@metrivum/ui-web";
import { useProfile } from "~/modules/accounts";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import styles from "./WorkspaceSelect.module.css";

const OPTIONS = [
  { id: "coach", label: "Coach view", hint: "Clients, programs, analyses", Icon: ClipboardList },
  { id: "client", label: "Client view", hint: "Your own training", Icon: CircleUserRound },
] as const;

/**
 * Coach / Client view as a select under the logo. Accounts without the coach role only have the
 * client view, so it is hidden for them. On the collapsed rail only the icon stays (name in a tooltip).
 */
export function WorkspaceSelect({ collapsed = false }: { collapsed?: boolean }) {
  const uiCopy = useUiCopy();

  const { mode, switchMode, switching } = useWorkspace();
  const profile = useProfile();
  if (!profile.roles.includes("Coach")) return null;
  const current = OPTIONS.find((option) => option.id === mode) ?? OPTIONS[0];
  return (
    <div className={styles.wrap}>
      <Select
        aria-label={uiCopy["ui"]["Workspace view"]}
        selectedKey={mode}
        isDisabled={switching}
        onSelectionChange={(key) => {
          if ((key === "coach" || key === "client") && key !== mode) void switchMode(key);
        }}
        className={styles.select}
      >
        <Hint label={current.label} placement="right" disabled={!collapsed}>
          <Button className={styles.trigger}>
            <span className={styles.tile} data-view={current.id} aria-hidden="true"><current.Icon /></span>
            <span className={styles.value}>{current.label}</span>
            <ChevronsUpDown aria-hidden="true" className={styles.chevron} />
          </Button>
        </Hint>
        {/* Two equal rows: the active one carries a check, the other switches on click. */}
        <Popover className={styles.popover} placement={collapsed ? "right top" : "bottom start"} offset={6}>
          <ListBox className={styles.list}>
            {OPTIONS.map(({ id, label, hint, Icon }) => (
              <ListBoxItem key={id} id={id} textValue={label} className={styles.option} data-view={id}>
                <span className={styles.tile} aria-hidden="true"><Icon /></span>
                <span className={styles.text}>
                  <Text slot="label" className={styles.name}>{label}</Text>
                  <Text slot="description" className={styles.hint}>{hint}</Text>
                </span>
                <Check aria-hidden="true" className={styles.check} />
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>
    </div>
  );
}
