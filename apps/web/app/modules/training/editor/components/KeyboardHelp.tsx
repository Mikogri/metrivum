import { Keyboard } from "lucide-react";
import { DialogTrigger, IconButton, Dialog, Kbd } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./KeyboardHelp.module.css";

export function KeyboardHelp() {
  const m = useT();
  const t = m.editor.keyboard;
  return (
    <DialogTrigger>
      <IconButton label={t.open} icon={<Keyboard />} />
      <Dialog title={t.title} size="md" closeLabel={m.common.close}>
        <dl className={styles.list}>
          {t.items.map(([keys = "", action = ""]) => (
            <div key={keys} className={styles.item}>
              <dt>
                {keys.split(" / ").map((part, i) => (
                  <Kbd key={i}>{part}</Kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </DialogTrigger>
  );
}
