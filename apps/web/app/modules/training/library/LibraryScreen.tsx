import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  LayoutTemplate,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  SearchX,
  Table2,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import {
  PrefetchPageLinks,
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from "react-router";
import type {
  DocumentKind,
  FolderDto,
  PlanListItem,
} from "@metrivum/api-client-web";
import { LinkButton } from "@portable-ui/react";
import {
  Badge,
  Breadcrumbs,
  Button,
  ContextMenu,
  DataTable,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  LoadingState,
  Option,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Switch,
  Toolbar,
  toast,
  type ContextMenuEntry,
} from "@portable-ui/react";
import { LockedReason, useFeatures } from "~/shared/access";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import {
  useAccountContext,
  useAccountKey,
  useApi,
} from "~/shared/session/AccountScope";
import { deletePlan, publishRevision, setArchived } from "../api";
import { NotPublishedBadge } from "~/modules/coaching";
import { ImportWizard } from "../import-export/ImportWizard";
import { trainingKeys, useFolderChildren, usePlanList } from "../queries";
import {
  CopyPlanDialog,
  CreatePlanDialog,
  FolderDialogs,
  MovePlanDialog,
  type FolderDialogState,
} from "./dialogs";
import { folderPath, useFolderLookup } from "./folderLookup";
import type { FolderAction } from "./FolderTree";
import { useDragToFolder, type DragItem } from "./dragToFolder";
import styles from "./LibraryScreen.module.css";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import { ProgramsIcon } from "~/layouts/components/navIcons";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

const DEFAULTS = {
  folder: "",
  q: "",
  sort: "updated",
  archived: "",
  page: "1",
  view: "",
};

export function LibraryScreen({ kind }: { kind: DocumentKind }) {
  const m = useT();
  const t = m.training.library;
  const locale = useLocale();
  const navigate = useNavigate();
  const api = useApi();
  const a = useAccountKey();
  const { lifecycle } = useAccountContext();
  const queryClient = useQueryClient();
  // Publishing straight from the list: a program clients can't get yet, or one with changes not applied.
  const publish = useMutation({
    mutationFn: (plan: PlanListItem) =>
      publishRevision(api, plan.id, Number(plan.version), crypto.randomUUID()),
    onSuccess: (_, plan) => {
      toast({
        tone: "success",
        title:
          plan.publishedNumber == null
            ? "Program published"
            : "Changes applied",
        description: m["ui"]["Clients assigned to it get this version."],
      });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.all(a) });
    },
    onError: (error) => toast({ tone: "danger", title: errorText(m, error) }),
  });
  /** Whether clients can get a program (Publish / Apply are in its ⋯ menu). */
  const planStatus = (plan: PlanListItem) => {
    const never = plan.publishedNumber == null;
    const pending =
      !never && Number(plan.publishedDraftVersion) !== Number(plan.version);
    const badge = never ? (
      <NotPublishedBadge size="sm" />
    ) : pending ? (
      <Badge size="sm" tone="danger" className={styles.pendingBadge}>
        {m["editor"]["draftState"]["draft"]}
      </Badge>
    ) : (
      <Badge size="sm" tone="success">
        {m["ui"]["Published · v"]}
        {Number(plan.publishedNumber)}
      </Badge>
    );
    return badge;
  };
  const showError = useErrorToast();
  const [params, setParams] = useSearchParams();
  const [state, update] = useUrlState(DEFAULTS);
  const pageSize = PAGE_SIZE;
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounced(search, 300);
  const page = pageFromParam(state.page);
  const folderId = state.folder || null;
  const access = useFeatures([
    "training.programs.create",
    "training.programs.manage",
    "training.folders.manage",
    "training.templates.manage",
    "training.import.csv",
  ] as const);
  const canCreate =
    access["training.programs.create"].allowed &&
    (kind === "Program" || access["training.templates.manage"].allowed);
  const canManage =
    access["training.programs.manage"].allowed &&
    (kind === "Program" || access["training.templates.manage"].allowed);
  const canFolders = access["training.folders.manage"].allowed;
  const dnd = useDragToFolder(true);

  const [createOpen, setCreateOpen] = useState(params.get("create") === "1");
  const [importOpen, setImportOpen] = useState(
    params.get("import") === "1" && kind === "Program",
  );
  const [copyTarget, setCopyTarget] = useState<{
    plan: PlanListItem;
    fromTemplate: boolean;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<PlanListItem | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    target:
      | { type: "space" }
      | { type: "plan"; plan: PlanListItem }
      | { type: "folder"; folder: FolderDto };
  } | null>(null);

  // One-shot query flags from shortcuts (?create=1 / ?import=1) are removed once read.
  // The app bar can set them while this screen is already mounted, so react to every change.
  useEffect(() => {
    if (params.has("create") || params.has("import")) {
      if (params.get("create") === "1") setCreateOpen(true);
      if (params.get("import") === "1" && kind === "Program")
        setImportOpen(true);
      const next = new URLSearchParams(params);
      next.delete("create");
      next.delete("import");
      setParams(next, { replace: true });
    }
  }, [params, setParams, kind]);

  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const list = usePlanList({
    kind,
    folderId: folderId ?? undefined,
    // The top level lists only plans outside folders; a search looks through every folder.
    rootOnly: !folderId && !state.q,
    search: state.q || undefined,
    sort: state.sort,
    archived: state.archived === "1",
    page,
    pageSize,
  });
  const subfolders = useFolderChildren(folderId);
  const lookup = useFolderLookup();
  const path = folderPath(lookup, folderId);
  // Inside a folder, items can go one level up (to the parent folder or the top level).
  const upId = folderId ? (path[path.length - 2]?.id ?? null) : null;
  const upName = upId ? (path[path.length - 2]?.name ?? t.root) : t.root;

  const hrefFor = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("folder", id);
    else next.delete("folder");
    next.delete("page");
    const query = next.toString();
    return `${kind === "Template" ? "/app/templates" : "/app/programs"}${query ? `?${query}` : ""}`;
  };

  const deletion = useMutation({
    mutationFn: (plan: PlanListItem) => deletePlan(api, plan.id, plan.version),
    onSuccess: (_, plan) => {
      if (!lifecycle.isCurrent()) return;
      // Drop it from every loaded list at once, then refetch the counts and pages.
      queryClient.setQueriesData<{ items: PlanListItem[]; total?: number }>(
        { queryKey: trainingKeys.plans(a) },
        (data) =>
          data && Array.isArray(data.items)
            ? {
                ...data,
                items: data.items.filter((item) => item.id !== plan.id),
                ...(typeof data.total === "number"
                  ? { total: Math.max(0, data.total - 1) }
                  : {}),
              }
            : data,
      );
      queryClient.removeQueries({ queryKey: trainingKeys.plan(a, plan.id) });
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.deleteConfirm.done(plan.name) });
    },
    onError: (error) => {
      if (lifecycle.isCurrent()) showError(error);
    },
  });
  const archive = useMutation({
    mutationFn: ({
      plan,
      archived,
    }: {
      plan: PlanListItem;
      archived: boolean;
    }) => setArchived(api, plan.id, archived, plan.version),
    onSuccess: (_, { archived }) => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: archived ? t.archived : t.restored });
    },
    onError: (error) => showError(error),
  });

  const { ask, dialog: archiveDialog } = useDangerConfirm();
  const confirmArchive = async (plan: PlanListItem) => {
    const c = m.training.library.archiveConfirm;
    if (
      await ask({
        title: c.title(plan.name),
        body: c.body,
        confirmLabel: c.confirm,
        cancelLabel: c.cancel,
      })
    )
      archive.mutate({ plan, archived: true });
  };

  const onFolderAction = (action: FolderAction | "up", folder: FolderDto) => {
    if (action === "up") dnd.moveTo({ kind: "folder", folder }, upId);
    else if (action === "new")
      setFolderDialog({ mode: "create", parentId: folder.id });
    else setFolderDialog({ mode: action, folder });
  };

  const onPlanAction = (key: string, plan: PlanListItem) => {
    if (key === "up")
      dnd.moveTo({ kind: "plan", id: plan.id, name: plan.name }, upId);
    else if (key === "open") navigate(`/app/programs/${plan.id}`);
    else if (key === "edit")
      navigate(
        kind === "Template"
          ? `/app/templates/${plan.id}/edit`
          : `/app/programs/${plan.id}/edit`,
      );
    else if (key === "copy") setCopyTarget({ plan, fromTemplate: false });
    else if (key === "use") setCopyTarget({ plan, fromTemplate: true });
    else if (key === "move") setMoveTarget(plan);
    else if (key === "publish") publish.mutate(plan);
    else if (key === "delete")
      void (async () => {
        const c = t.deleteConfirm;
        if (
          await ask({
            title: c.title(plan.name),
            body: c.body,
            confirmLabel: c.confirm,
            cancelLabel: c.cancel,
          })
        )
          deletion.mutate(plan);
      })();
    else if (key === "archive") void confirmArchive(plan);
    else if (key === "restore") archive.mutate({ plan, archived: false });
  };

  const isTemplate = kind === "Template";
  const pageCount = list.data
    ? Math.max(1, Math.ceil(list.data.total / pageSize))
    : null;
  const texts = isTemplate ? m.training.templates : m.training.programs;
  const Icon = isTemplate ? LayoutTemplate : ProgramsIcon;

  // Folder and plan cards by default (programs and templates alike); the table view is one click away.
  const view = state.view === "table" ? "table" : "cards";
  const folders = !state.q ? (subfolders.data?.items ?? []) : [];

  const planMenu = (plan: PlanListItem) => (
    <DropdownMenuTrigger>
      <AriaButton
        className={styles.rowMenu}
        aria-label={m.common.moreActions(plan.name)}
      >
        <MoreVertical aria-hidden="true" />
      </AriaButton>
      <DropdownMenu onAction={(key) => onPlanAction(String(key), plan)}>
        <DropdownMenuItem id="open" icon={<Icon />}>
          {t.details}
        </DropdownMenuItem>
        <DropdownMenuItem
          id="edit"
          icon={<Pencil />}
          isDisabled={!canManage || plan.archived}
        >
          {t.editDraft}
        </DropdownMenuItem>
        {plan.kind === "Program" &&
        !plan.archived &&
        (plan.publishedNumber == null ||
          Number(plan.publishedDraftVersion) !== Number(plan.version)) ? (
          <DropdownMenuItem
            id="publish"
            icon={<Upload />}
            isDisabled={!canManage || publish.isPending}
          >
            {plan.publishedNumber == null
              ? m["ui"]["Publish"]
              : m["ui"]["Apply changes"]}
          </DropdownMenuItem>
        ) : null}
        {isTemplate ? (
          <DropdownMenuItem
            id="use"
            icon={<Copy />}
            isDisabled={
              !access["training.programs.create"].allowed || plan.archived
            }
          >
            {t.useTemplate}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          id="copy"
          icon={<Copy />}
          isDisabled={!access["training.programs.create"].allowed}
        >
          {t.copy}
        </DropdownMenuItem>
        <DropdownMenuItem
          id="move"
          icon={<FolderInput />}
          isDisabled={!canManage || plan.archived}
        >
          {t.moveTo}
        </DropdownMenuItem>
        {folderId ? (
          <DropdownMenuItem
            id="up"
            icon={<FolderUp />}
            isDisabled={!canManage || plan.archived}
          >
            {t.moveUp(upName)}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {plan.archived ? (
          <DropdownMenuItem
            id="restore"
            icon={<ArchiveRestore />}
            isDisabled={!canManage}
          >
            {m.common.restore}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            id="archive"
            icon={<Archive />}
            tone="danger"
            isDisabled={!canManage}
          >
            {m.common.archive}
          </DropdownMenuItem>
        )}
        {plan.canDelete ? <DropdownMenuSeparator /> : null}
        {plan.canDelete ? (
          <DropdownMenuItem
            id="delete"
            icon={<Trash2 />}
            tone="danger"
            isDisabled={!canManage || deletion.isPending}
          >
            {t.deleteConfirm.menu}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );

  const folderMenu = (folder: FolderDto) =>
    canFolders ? (
      <DropdownMenuTrigger>
        <AriaButton
          className={styles.rowMenu}
          aria-label={m.training.library.folder.actions(folder.name)}
        >
          <MoreVertical aria-hidden="true" />
        </AriaButton>
        <DropdownMenu
          onAction={(key) => onFolderAction(key as FolderAction | "up", folder)}
        >
          <DropdownMenuItem id="new">{t.newFolder}</DropdownMenuItem>
          <DropdownMenuItem id="rename">{m.common.rename}</DropdownMenuItem>
          <DropdownMenuItem id="move">{m.common.move}</DropdownMenuItem>
          {folderId ? (
            <DropdownMenuItem id="up">{t.moveUp(upName)}</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem id="delete" tone="danger">
            {m.common.delete}
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
    ) : null;

  // Right click: on a plan or folder it offers that item's actions, anywhere else the library's own.
  const ctx = t.contextMenu;
  const spaceItems = (): ContextMenuEntry[] => [
    {
      id: "new",
      label: isTemplate ? t.newTemplate : t.newProgram,
      icon: <Plus />,
      isDisabled: !canCreate,
    },
    ...(canFolders
      ? [{ id: "folder", label: t.newFolder, icon: <FolderPlus /> }]
      : []),
    ...(!isTemplate
      ? [
          {
            id: "import",
            label: t.import,
            icon: <Upload />,
            isDisabled: !access["training.import.csv"].allowed,
          },
        ]
      : []),
    { type: "separator", id: "s1" },
    ...(folderId
      ? [{ id: "parent", label: ctx.openParent(upName), icon: <FolderUp /> }]
      : []),
    {
      id: "view",
      label: view === "cards" ? ctx.showTable : ctx.showCards,
      icon: view === "cards" ? <Table2 /> : <LayoutGrid />,
    },
    {
      id: "archived",
      label: state.archived === "1" ? ctx.hideArchived : ctx.showArchived,
      icon: state.archived === "1" ? <ArchiveRestore /> : <Archive />,
    },
    { id: "refresh", label: ctx.refresh, icon: <RefreshCw /> },
  ];
  const planItems = (plan: PlanListItem): ContextMenuEntry[] => [
    { id: "open", label: t.details, icon: <Icon /> },
    {
      id: "edit",
      label: t.editDraft,
      icon: <Pencil />,
      isDisabled: !canManage || plan.archived,
    },
    ...(isTemplate
      ? [
          {
            id: "use",
            label: t.useTemplate,
            icon: <Copy />,
            isDisabled:
              !access["training.programs.create"].allowed || plan.archived,
          },
        ]
      : []),
    {
      id: "copy",
      label: t.copy,
      icon: <Copy />,
      isDisabled: !access["training.programs.create"].allowed,
    },
    {
      id: "move",
      label: t.moveTo,
      icon: <FolderInput />,
      isDisabled: !canManage || plan.archived,
    },
    ...(folderId
      ? [
          {
            id: "up",
            label: t.moveUp(upName),
            icon: <FolderUp />,
            isDisabled: !canManage || plan.archived,
          },
        ]
      : []),
    { type: "separator", id: "s1" },
    plan.archived
      ? {
          id: "restore",
          label: m.common.restore,
          icon: <ArchiveRestore />,
          isDisabled: !canManage,
        }
      : {
          id: "archive",
          label: m.common.archive,
          icon: <Archive />,
          tone: "danger",
          isDisabled: !canManage,
        },
    ...(plan.canDelete
      ? [
          { type: "separator" as const, id: "s2" },
          {
            id: "delete",
            label: t.deleteConfirm.menu,
            icon: <Trash2 />,
            tone: "danger" as const,
            isDisabled: !canManage || deletion.isPending,
          },
        ]
      : []),
  ];
  const folderItems = (): ContextMenuEntry[] => [
    { id: "open", label: ctx.openFolder, icon: <Folder /> },
    ...(canFolders
      ? ([
          { id: "new", label: t.newFolder, icon: <FolderPlus /> },
          { id: "rename", label: m.common.rename, icon: <Pencil /> },
          { id: "move", label: m.common.move, icon: <FolderInput /> },
          ...(folderId
            ? [{ id: "up", label: t.moveUp(upName), icon: <FolderUp /> }]
            : []),
          { type: "separator", id: "s1" },
          {
            id: "delete",
            label: m.common.delete,
            icon: <Trash2 />,
            tone: "danger",
          },
        ] as ContextMenuEntry[])
      : []),
  ];
  const onSpaceAction = (key: string) => {
    if (key === "new") setCreateOpen(true);
    else if (key === "folder")
      setFolderDialog({ mode: "create", parentId: folderId });
    else if (key === "import") setImportOpen(true);
    else if (key === "parent") navigate(hrefFor(upId));
    else if (key === "view")
      update({ view: view === "cards" ? "table" : "cards" });
    else if (key === "archived")
      update({ archived: state.archived === "1" ? null : "1" });
    else if (key === "refresh")
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
  };
  const openMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    // Fields, dialogs and menus keep the browser's own menu.
    if (
      target.closest(
        "input, textarea, [contenteditable], [role=dialog], [role=menu], [role=listbox]",
      )
    )
      return;
    const card = target.closest<HTMLElement>("[data-ctx]");
    const [type, id] = (card?.dataset.ctx ?? "space:").split(":");
    const plan =
      type === "plan" ? list.data?.items.find((p) => p.id === id) : undefined;
    const folder =
      type === "folder" ? folders.find((f) => f.id === id) : undefined;
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      target: plan
        ? { type: "plan", plan }
        : folder
          ? { type: "folder", folder }
          : { type: "space" },
    });
  };

  type Entry =
    | { type: "folder"; folder: FolderDto }
    | { type: "plan"; plan: PlanListItem };
  const entries: Entry[] = [
    ...folders.map((folder) => ({ type: "folder" as const, folder })),
    ...(list.data?.items ?? []).map((plan) => ({
      type: "plan" as const,
      plan,
    })),
  ];
  const kindOf = (entry: Entry) =>
    entry.type === "folder" ? "folder" : isTemplate ? "template" : "program";

  // Drag and drop: plans (when they can be managed) and folders (when folders can) move into folders.
  const dragPlan = (plan: PlanListItem) =>
    canManage && !plan.archived
      ? dnd.source({ kind: "plan", id: plan.id, name: plan.name })
      : {};
  const dragFolder = (folder: FolderDto) =>
    canFolders ? dnd.source({ kind: "folder", folder } as DragItem) : {};
  const dropFolder = (folder: FolderDto) => dnd.target(folder.id, folder.id);

  // Folders and plans arrive separately: the empty state waits for both, so it never shows while one is loading.
  const loading = list.isPending || (!state.q && subfolders.isPending);
  const body = loading ? (
    <LoadingState label={m.common.loading} />
  ) : list.isError ? (
    <ErrorState
      title={errorText(m, list.error)}
      reference={traceIdOf(list.error)}
      actions={
        <Button onPress={() => void list.refetch()}>{m.common.retry}</Button>
      }
    />
  ) : entries.length === 0 ? (
    state.q ? (
      <EmptyState
        icon={<SearchX />}
        title={t.noResultsTitle}
        description={t.noResultsBody}
      />
    ) : state.archived ? (
      <EmptyState
        icon={<Archive />}
        title={t.archivedEmpty}
        description={t.archivedEmptyBody}
      />
    ) : folderId ? (
      <EmptyState
        icon={<Folder />}
        title={t.emptyFolderTitle}
        description={t.emptyFolderBody}
      />
    ) : (
      <EmptyState
        icon={<Icon />}
        title={isTemplate ? t.emptyTemplatesTitle : t.emptyProgramsTitle}
        description={isTemplate ? t.emptyTemplatesBody : t.emptyProgramsBody}
        actions={
          canCreate ? (
            <Button
              variant="primary"
              iconStart={<Plus />}
              onPress={() => setCreateOpen(true)}
            >
              {isTemplate ? t.newTemplate : t.newProgram}
            </Button>
          ) : undefined
        }
      />
    )
  ) : view === "cards" ? (
    <ul
      className={styles.cards}
      data-stale={list.isPlaceholderData || undefined}
    >
      {entries.map((entry, i) =>
        entry.type === "folder" ? (
          <li
            key={`f-${entry.folder.id}`}
            className={styles.card}
            data-kind="folder"
            data-ctx={`folder:${entry.folder.id}`}
            style={{ "--i": i } as React.CSSProperties}
            {...dragFolder(entry.folder)}
            {...dropFolder(entry.folder)}
          >
            <div className={styles.cardTop}>
              <span
                className={styles.cardIcon}
                data-kind="folder"
                aria-hidden="true"
              >
                <Folder />
              </span>
              {folderMenu(entry.folder)}
            </div>
            <RouterLink
              to={hrefFor(entry.folder.id)}
              className={styles.cardTitle}
              data-card-link
              draggable={false}
            >
              {entry.folder.name}
            </RouterLink>
            <span className={styles.cardMeta}>{t.folderLabel}</span>
          </li>
        ) : (
          <li
            key={entry.plan.id}
            className={styles.card}
            data-ctx={`plan:${entry.plan.id}`}
            style={{ "--i": i } as React.CSSProperties}
            {...dragPlan(entry.plan)}
          >
            <div className={styles.cardTop}>
              <span
                className={styles.cardIcon}
                data-kind={kindOf(entry)}
                aria-hidden="true"
              >
                <Icon />
              </span>
              {planMenu(entry.plan)}
            </div>
            <RouterLink
              to={`/app/programs/${entry.plan.id}`}
              className={styles.cardTitle}
              data-card-link
              draggable={false}
            >
              {entry.plan.name}
            </RouterLink>
            <span
              className={styles.cardDescription}
              data-empty={!entry.plan.description || undefined}
            >
              {entry.plan.description || t.noDescription}
            </span>
            {/* Status and last update sit at the bottom of every card, however long the description is. */}
            <span className={styles.cardFoot}>
              {entry.plan.kind === "Program" ? (
                <span className={styles.cardStatus}>
                  {planStatus(entry.plan)}
                </span>
              ) : null}
              <span className={styles.cardMeta}>
                {entry.plan.archived ? (
                  <Badge tone="warning" size="sm">
                    {t.archivedBadge}
                  </Badge>
                ) : null}
                {m.common.updated(formatRelative(locale, entry.plan.updatedAt))}
              </span>
            </span>
          </li>
        ),
      )}
    </ul>
  ) : (
    <DataTable<Entry>
      label={texts.title}
      stale={list.isPlaceholderData}
      rows={entries}
      rowKey={(entry) =>
        entry.type === "folder" ? `f-${entry.folder.id}` : entry.plan.id
      }
      rowProps={(entry) =>
        entry.type === "folder"
          ? {
              "data-ctx": `folder:${entry.folder.id}`,
              ...dragFolder(entry.folder),
              ...dropFolder(entry.folder),
            }
          : { "data-ctx": `plan:${entry.plan.id}`, ...dragPlan(entry.plan) }
      }
      columns={[
        {
          id: "name",
          header: t.columns.name,
          cell: (entry) => (
            <span className={styles.nameCell}>
              <span
                className={styles.tableIcon}
                data-kind={kindOf(entry)}
                aria-hidden="true"
              >
                {entry.type === "folder" ? <Folder /> : <Icon />}
              </span>
              {entry.type === "folder" ? (
                <RouterLink
                  to={hrefFor(entry.folder.id)}
                  data-row-link
                  draggable={false}
                >
                  {entry.folder.name}
                </RouterLink>
              ) : (
                <RouterLink
                  to={`/app/programs/${entry.plan.id}`}
                  data-row-link
                  draggable={false}
                >
                  {entry.plan.name}
                </RouterLink>
              )}
            </span>
          ),
        },
        {
          id: "description",
          header: t.columns.description,
          muted: true,
          hideOnMobile: true,
          cell: (entry) =>
            entry.type === "folder"
              ? t.folderLabel
              : entry.plan.description || "—",
        },
        ...(isTemplate
          ? []
          : [
              {
                id: "status",
                header: "Status",
                width: "12.5rem",
                cell: (entry: Entry) =>
                  entry.type === "folder" || entry.plan.kind !== "Program" ? (
                    <span aria-hidden="true">—</span>
                  ) : (
                    planStatus(entry.plan)
                  ),
              },
            ]),
        {
          id: "updated",
          header: t.columns.updated,
          width: "9rem",
          muted: true,
          hideOnMobile: true,
          cell: (entry) =>
            entry.type === "folder"
              ? "—"
              : formatRelative(locale, entry.plan.updatedAt),
        },
        {
          id: "actions",
          header: (
            <span className="tf-visually-hidden">{m.common.actions}</span>
          ),
          width: isTemplate ? "12rem" : "8rem",
          align: "end",
          cell: (entry) =>
            entry.type === "folder" ? (
              folderMenu(entry.folder)
            ) : (
              <span className={styles.rowActions}>
                {entry.plan.archived ? (
                  <Badge tone="warning" size="sm">
                    {t.archivedBadge}
                  </Badge>
                ) : null}
                {isTemplate && !entry.plan.archived ? (
                  <Button
                    size="sm"
                    iconStart={<Copy />}
                    isDisabled={!access["training.programs.create"].allowed}
                    onPress={() =>
                      setCopyTarget({ plan: entry.plan, fromTemplate: true })
                    }
                  >
                    {t.useTemplate}
                  </Button>
                ) : null}
                {planMenu(entry.plan)}
              </span>
            ),
        },
      ]}
    />
  );

  return (
    <div className={styles.screen} onContextMenu={openMenu}>
      {archiveDialog}
      {/* Detail and editor code load in the background, so opening a plan is instant. */}
      {list.data?.items[0] ? (
        <PrefetchPageLinks
          page={`${kind === "Template" ? "/app/templates" : "/app/programs"}/${list.data.items[0].id}/edit`}
        />
      ) : null}
      {list.data?.items[0] ? (
        <PrefetchPageLinks page={`/app/programs/${list.data.items[0].id}`} />
      ) : null}
      <div className={styles.main}>
        <PageHeader
          context={
            folderId ? (
              <Breadcrumbs
                items={[
                  { id: "root", label: texts.title, href: hrefFor(null) },
                  ...path.map((folder, index) => ({
                    id: folder.id,
                    label: folder.name ?? "…",
                    href:
                      index === path.length - 1
                        ? undefined
                        : hrefFor(folder.id),
                  })),
                ]}
              />
            ) : undefined
          }
          title={
            folderId
              ? (path[path.length - 1]?.name ?? texts.title)
              : texts.title
          }
          description={folderId ? undefined : texts.description}
          actions={
            <>
              {!isTemplate && (
                <LinkButton
                  href="/app/programs/generate"
                  iconStart={<WandSparkles />}
                >
                  {m["ui"]["Generate program"]}
                </LinkButton>
              )}
              {canFolders ? (
                <Button
                  iconStart={<FolderPlus />}
                  onPress={() =>
                    setFolderDialog({ mode: "create", parentId: folderId })
                  }
                >
                  {t.newFolder}
                </Button>
              ) : null}
              {!isTemplate ? (
                <LockedReason
                  access={access["training.import.csv"]}
                  upgrade={false}
                >
                  <Button
                    iconStart={<Upload />}
                    isDisabled={!access["training.import.csv"].allowed}
                    onPress={() => setImportOpen(true)}
                  >
                    {t.import}
                  </Button>
                </LockedReason>
              ) : null}
              <LockedReason
                upgrade={false}
                access={
                  isTemplate && !access["training.templates.manage"].allowed
                    ? access["training.templates.manage"]
                    : access["training.programs.create"]
                }
              >
                <Button
                  variant="primary"
                  iconStart={<Plus />}
                  isDisabled={!canCreate}
                  onPress={() => setCreateOpen(true)}
                >
                  {isTemplate ? t.newTemplate : t.newProgram}
                </Button>
              </LockedReason>
            </>
          }
        />
        <HubNavigation />

        <Toolbar aria-label={m.common.search} className={styles.toolbar}>
          <SearchInput
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={setSearch}
            className={styles.search}
          />
          <Select
            aria-label={m.common.sortBy}
            selectedKey={state.sort}
            onSelectionChange={(key) => update({ sort: String(key) })}
            className={styles.sort}
          >
            {Object.entries(t.sort).map(([key, text]) => (
              <Option key={key} id={key}>
                {text}
              </Option>
            ))}
          </Select>
          <Switch
            isSelected={state.archived === "1"}
            onChange={(on) => update({ archived: on ? "1" : null })}
          >
            {t.showArchived}
          </Switch>
          <LibraryViewToggle
            value={view === "table" ? "list" : "cards"}
            onChange={(next) =>
              update({ view: next === "list" ? "table" : "cards" })
            }
          />
        </Toolbar>

        {list.data && entries.length ? (
          <p className={styles.count} aria-live="polite">
            {t.count(list.data.total + folders.length)}
          </p>
        ) : null}
        {folderId && dnd.dragging ? (
          <div className={styles.dropParent} {...dnd.target(upId, "parent")}>
            <FolderInput aria-hidden="true" />
            {t.dropToParent(upName)}
          </div>
        ) : null}
        {body}
        {list.data && list.data.items.length ? (
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={(next) =>
              update({ page: String(next) }, { replace: false })
            }
            pageSize={pageSize}
            labels={{
              previous: m.common.previous,
              next: m.common.next,
              status: m.common.pageStatus,
              navigation: m.common.pagination,
              pageSize: m.common.perPage,
            }}
          />
        ) : null}
      </div>

      <CreatePlanDialog
        kind={kind}
        folderId={folderId}
        folderName={path[path.length - 1]?.name ?? undefined}
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
      />
      <CopyPlanDialog
        plan={copyTarget?.plan ?? null}
        fromTemplate={copyTarget?.fromTemplate}
        onClose={() => setCopyTarget(null)}
      />
      <MovePlanDialog plan={moveTarget} onClose={() => setMoveTarget(null)} />
      <FolderDialogs
        state={folderDialog}
        onClose={() => setFolderDialog(null)}
        onDeleted={(folder) => {
          if (folderId === folder.id)
            navigate(hrefFor(folder.parentId), { replace: true });
        }}
      />
      {kind === "Program" ? (
        <ImportWizard
          isOpen={importOpen}
          onOpenChange={setImportOpen}
          folderId={folderId}
        />
      ) : null}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={
            menu.target.type === "plan"
              ? menu.target.plan.name
              : menu.target.type === "folder"
                ? menu.target.folder.name
                : texts.title
          }
          items={
            menu.target.type === "plan"
              ? planItems(menu.target.plan)
              : menu.target.type === "folder"
                ? folderItems()
                : spaceItems()
          }
          onAction={(key) => {
            const target = menu.target;
            if (target.type === "plan") onPlanAction(key, target.plan);
            else if (target.type === "folder") {
              if (key === "open") navigate(hrefFor(target.folder.id));
              else onFolderAction(key as FolderAction | "up", target.folder);
            } else onSpaceAction(key);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
