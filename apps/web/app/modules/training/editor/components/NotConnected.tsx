import { Unplug } from "lucide-react";
import { Tooltip, TooltipTrigger } from "@portable-ui/react";
import { Button as AriaButton } from "react-aria-components";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./SheetCanvas.module.css";

/** A small amber pill on a sheet card that isn't plugged into anything, with how to connect it on hover. */
export function NotConnected({
  kind,
}: {
  kind: "cycle" | "workout" | "maxes" | "block";
}) {
  const t = useT().editor.sheet;
  return (
    <TooltipTrigger delay={200}>
      <AriaButton
        className={styles.notConnected}
        data-no-drag
        aria-label={`${t.notConnected}. ${t.notConnectedHint[kind]}`}
      >
        <Unplug aria-hidden="true" />
        <span>{t.notConnected}</span>
      </AriaButton>
      <Tooltip placement="top">{t.notConnectedHint[kind]}</Tooltip>
    </TooltipTrigger>
  );
}
