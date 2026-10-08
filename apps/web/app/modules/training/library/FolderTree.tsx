import { ChevronRight, Folder, FolderOpen, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Link as RouterLink } from "react-router";
import type { FolderDto } from "@trainflow/api-client-web";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, Skeleton } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useFolderChildren } from "../queries";
import styles from "./FolderTree.module.css";

export type FolderAction = "rename" | "move" | "delete" | "new";

interface TreeProps {
  currentId: string | null;
  /** Build the link for a folder (keeps other URL state such as kind/sort). */
  hrefFor: (folderId: string | null) => string;
  /** When given, folders are chosen instead of navigated to (pickers). */
  onSelect?: (folder: FolderDto | null) => void;
  onAction?: (action: FolderAction, folder: FolderDto) => void;
  canManage?: boolean;
  label: string;
}

function FolderNode({ folder, depth, props }: { folder: FolderDto; depth: number; props: TreeProps }) {
  const m = useT();
  const [open, setOpen] = useState(false);
  const children = useFolderChildren(folder.id, open);
  const active = props.currentId === folder.id;
  const Icon = open ? FolderOpen : Folder;
  const content = (
    <>
      <Icon aria-hidden="true" className={styles.icon} />
      <span className={styles.name}>{folder.name}</span>
    </>
  );
  return (
    <li className={styles.node}>
      <div className={styles.row} data-active={active || undefined} style={{ "--depth": depth } as React.CSSProperties}>
        <AriaButton
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`${folder.name}`}
          onPress={() => setOpen((value) => !value)}
        >
          <ChevronRight aria-hidden="true" className={styles.chevron} data-open={open || undefined} />
        </AriaButton>
        {props.onSelect ? (
          <AriaButton className={styles.link} onPress={() => props.onSelect?.(folder)} aria-pressed={active}>
            {content}
          </AriaButton>
        ) : (
          <RouterLink to={props.hrefFor(folder.id)} className={styles.link} aria-current={active ? "page" : undefined}>
            {content}
          </RouterLink>
        )}
        {props.canManage && props.onAction ? (
          <DropdownMenuTrigger>
            <AriaButton className={styles.menu} aria-label={m.training.library.folder.actions(folder.name)}>
              <MoreVertical aria-hidden="true" />
            </AriaButton>
            <DropdownMenu onAction={(key) => props.onAction?.(key as FolderAction, folder)} placement="bottom start">
              <DropdownMenuItem id="new">{m.training.library.newFolder}</DropdownMenuItem>
              <DropdownMenuItem id="rename">{m.common.rename}</DropdownMenuItem>
              <DropdownMenuItem id="move">{m.common.move}</DropdownMenuItem>
              <DropdownMenuItem id="delete" tone="danger">
                {m.common.delete}
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
        ) : null}
      </div>
      {open ? (
        <ul className={styles.children}>
          {children.isPending ? (
            <li className={styles.loading} style={{ "--depth": depth + 1 } as React.CSSProperties}>
              <Skeleton height="1.25rem" width="70%" />
            </li>
          ) : (
            (children.data?.items ?? []).map((child) => <FolderNode key={child.id} folder={child} depth={depth + 1} props={props} />)
          )}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Folder navigation with lazy children. A nested list of links with disclosure buttons:
 * simpler for keyboard and screen-reader users than a custom tree widget.
 */
export function FolderTree(props: TreeProps) {
  const m = useT();
  const roots = useFolderChildren(null);
  const rootActive = props.currentId === null;
  return (
    <nav aria-label={props.label} className={styles.tree}>
      <ul className={styles.list}>
        <li>
          <div className={styles.row} data-active={rootActive || undefined} style={{ "--depth": 0 } as React.CSSProperties}>
            <span className={styles.toggleSpacer} />
            {props.onSelect ? (
              <AriaButton className={styles.link} onPress={() => props.onSelect?.(null)} aria-pressed={rootActive}>
                <FolderOpen aria-hidden="true" className={styles.icon} />
                <span className={styles.name}>{m.training.library.root}</span>
              </AriaButton>
            ) : (
              <RouterLink to={props.hrefFor(null)} className={styles.link} aria-current={rootActive ? "page" : undefined}>
                <FolderOpen aria-hidden="true" className={styles.icon} />
                <span className={styles.name}>{m.training.library.root}</span>
              </RouterLink>
            )}
          </div>
        </li>
        {roots.isPending ? (
          <li className={styles.loading}>
            <Skeleton height="1.25rem" width="80%" />
          </li>
        ) : (
          (roots.data?.items ?? []).map((folder) => <FolderNode key={folder.id} folder={folder} depth={0} props={props} />)
        )}
      </ul>
    </nav>
  );
}
