import { CornerDownLeft, Search, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, Input, Modal, ModalOverlay } from "react-aria-components";
import { useNavigate } from "react-router";
import { Kbd } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { appNavItems, settingsNavItem } from "./nav";
import styles from "./CommandPalette.module.css";
import { ProgramsIcon } from "~/layouts/components/navIcons";

/**
 * Quick page jump (inspiration: command palette). Opened with ⌘K it appears instantly — it is used
 * constantly; opened from the app bar search it drops in from the search box.
 */
export function CommandPalette({ isOpen, animated = false, onOpenChange }: { isOpen: boolean; animated?: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useT();
  const { mode } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const pages = [...appNavItems(m, mode === "coach" ? ["Coach"] : ["Client"]), settingsNavItem(m)].map((item) => ({ ...item, section: m.nav.commandSections.pages }));
    const actions = mode === "coach" ? [
      { to: "/app/programs?create=1", label: m.training.library.newProgram, icon: ProgramsIcon, section: m.nav.commandSections.actions },
      { to: "/app/programs?import=1", label: m.training.library.import, icon: ProgramsIcon, section: m.nav.commandSections.actions },
      { to: "/app/video-analyses/new", label: m.video.list.new, icon: Video, section: m.nav.commandSections.actions },
    ] : [];
    const all = [...pages, ...actions];
    const q = query.trim().toLowerCase();
    return q ? all.filter((item) => item.label.toLowerCase().includes(q)) : all;
  }, [m, query, mode]);

  const go = (index: number) => {
    const item = items[index];
    if (!item) return;
    onOpenChange(false);
    setQuery("");
    navigate(item.to);
  };

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={styles.overlay} data-animated={animated || undefined}>
      <Modal className={styles.modal}>
        <Dialog aria-label={m.nav.commandPalette} className={styles.dialog}>
          <div className={styles.inputRow}>
            <Search aria-hidden="true" />
            <Input
              autoFocus
              aria-label={m.nav.commandPalette}
              placeholder={m.nav.commandPalette}
              value={query}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={items[active] ? `command-${active}` : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((i) => Math.min(items.length - 1, i + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(active);
                }
              }}
              className={styles.input}
            />
            <Kbd>Esc</Kbd>
          </div>
          <ul id="command-list" role="listbox" aria-label={m.nav.commandHint} className={styles.list}>
            {items.length === 0 ? <li className={styles.empty}>{m.nav.commandEmpty}</li> : null}
            {items.map((item, index) => {
              const Icon = item.icon;
              const showSection = index === 0 || items[index - 1]?.section !== item.section;
              return (
                <li key={`${item.section}-${item.to}`} role="presentation">
                  {showSection ? (
                    <p className={styles.section} role="presentation">
                      {item.section}
                    </p>
                  ) : null}
                  <div
                    id={`command-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={styles.item}
                    onPointerMove={() => setActive(index)}
                    onClick={() => go(index)}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={styles.label}>{item.label}</span>
                    {index === active ? <CornerDownLeft aria-hidden="true" className={styles.enter} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
