import { useQuery } from "@tanstack/react-query";
import {
  CornerDownLeft,
  HeartPulse,
  Search,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, Input, Modal, ModalOverlay } from "react-aria-components";
import { useNavigate } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Avatar, Kbd, Spinner } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { appNavItems, settingsNavItem } from "./nav";
import type { NavIcon } from "./navIcons";
import { ProgramsIcon, SettingsIcon } from "./navIcons";
import styles from "./CommandPalette.module.css";

type Item = {
  key: string;
  to: string;
  label: string;
  detail?: string;
  section: string;
  icon?: NavIcon | LucideIcon;
  /** People and clients show their initials instead of an icon. */
  avatar?: string;
};

type Person = { userId: string; username: string; displayName: string };
type Page<T> = { items: T[] };

/** Text match on words: "vid an" finds "Video analyses". */
function matches(text: string, query: string) {
  const haystack = text.toLowerCase();
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function useDebounced(value: string, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Search everything from one box (⌘K or the app bar): pages and actions locally, then people by username,
 * your own teams and (in the coach workspace) your clients. "@name" searches only people.
 */
export function CommandPalette({
  isOpen,
  animated = false,
  onOpenChange,
}: {
  isOpen: boolean;
  animated?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useT();
  const { mode } = useWorkspace();
  const navigate = useNavigate();
  const api = useApi();
  const account = useAccountKey();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = query.trim().toLowerCase();
  const peopleOnly = q.startsWith("@");
  const term = useDebounced(q.replace(/^@/, ""));
  const settled = term === q.replace(/^@/, "");
  const searchable = term.length >= 2 && term.length <= 30;

  // People: username prefix search (the server rate-limits it and hides inactive accounts).
  const people = useQuery({
    queryKey: [account, "palette", "people", term],
    enabled: isOpen && searchable,
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      (
        await api<Person[]>({
          path: "/api/v1/accounts/people",
          query: { search: term },
          signal,
        })
      ).data,
  });
  // Teams: only the ones you belong to (teams are not publicly searchable); loaded once per opening.
  const teams = useQuery({
    queryKey: [account, "palette", "teams"],
    enabled: isOpen,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (await api<Schema<"TeamHomeDto">>({ path: "/api/v1/teams/mine", signal }))
        .data.teams,
  });
  const clients = useQuery({
    queryKey: [account, "palette", "clients", term],
    enabled: isOpen && mode === "coach" && searchable && !peopleOnly,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api<Page<Schema<"CoachRelationshipDto">>>({
          path: "/api/v1/coaching/clients",
          query: { search: term, pageSize: 5 },
          signal,
        })
      ).data.items,
  });

  const items = useMemo(() => {
    const s = m.nav.commandSections;
    const pages: Item[] = [
      ...appNavItems(m, mode === "coach" ? ["Coach"] : ["Client"]),
      settingsNavItem(m),
    ].map((item) => ({
      key: `page:${item.to}`,
      to: item.to,
      label: item.label,
      icon: item.icon,
      section: s.pages,
    }));
    // Shortcuts to the most used settings and the own profile.
    const shortcuts: Item[] = [
      {
        key: "profile",
        to: "/app/profile",
        label: m.nav.profile,
        icon: UserRound,
        section: s.pages,
      },
      {
        key: "settings:body",
        to: "/app/settings?section=body",
        label: `${m.settings.title} · ${m.settings.sections.body}`,
        icon: HeartPulse,
        section: s.actions,
      },
      {
        key: "settings:accounts",
        to: "/app/settings?section=accounts",
        label: `${m.settings.title} · ${m.settings.sections.accounts}`,
        icon: SettingsIcon,
        section: s.actions,
      },
    ];
    const actions: Item[] =
      mode === "coach"
        ? [
            {
              key: "new-program",
              to: "/app/programs?create=1",
              label: m.training.library.newProgram,
              icon: ProgramsIcon,
              section: s.actions,
            },
            {
              key: "import-program",
              to: "/app/programs?import=1",
              label: m.training.library.import,
              icon: ProgramsIcon,
              section: s.actions,
            },
            {
              key: "new-analysis",
              to: "/app/video-analyses/new",
              label: m.video.list.new,
              icon: Video,
              section: s.actions,
            },
          ]
        : [];
    const local = [...pages, ...shortcuts, ...actions];
    if (!q) return local;
    if (peopleOnly) return (people.data ?? []).map(personItem);
    const found = local.filter((item) => matches(item.label, q));
    const teamItems: Item[] = (teams.data ?? [])
      .filter((team) => matches(team.name, q))
      .slice(0, 5)
      .map((team) => ({
        key: `team:${team.id}`,
        to: "/app/team",
        label: team.name,
        detail: team.role,
        icon: Users,
        section: s.teams,
      }));
    const clientItems: Item[] = (clients.data ?? []).map((client) => ({
      key: `client:${client.id}`,
      to: `/app/clients/${client.id}`,
      label: client.client.displayName,
      detail: client.client.username ? `@${client.client.username}` : undefined,
      avatar: client.client.displayName,
      section: s.clients,
    }));
    return [
      ...found,
      ...clientItems,
      ...(searchable && settled ? (people.data ?? []).map(personItem) : []),
      ...teamItems,
    ];

    function personItem(person: Person): Item {
      return {
        key: `person:${person.userId}`,
        to: `/app/people/${encodeURIComponent(person.username)}`,
        label: person.displayName || person.username,
        detail: `@${person.username}`,
        avatar: person.displayName || person.username,
        section: s.people,
      };
    }
  }, [
    m,
    q,
    mode,
    peopleOnly,
    people.data,
    teams.data,
    clients.data,
    searchable,
    settled,
  ]);

  const searching =
    searchable && (!settled || people.isFetching || clients.isFetching);
  const safeActive = Math.min(active, Math.max(0, items.length - 1));

  const go = (index: number) => {
    const item = items[index];
    if (!item) return;
    onOpenChange(false);
    setQuery("");
    navigate(item.to);
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay}
      data-animated={animated || undefined}
    >
      <Modal className={styles.modal}>
        <Dialog aria-label={m.nav.commandPalette} className={styles.dialog}>
          <div className={styles.inputRow}>
            {searching ? <Spinner size="sm" /> : <Search aria-hidden="true" />}
            <Input
              autoFocus
              aria-label={m.nav.commandPalette}
              placeholder={m.nav.commandPalette}
              value={query}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={
                items[safeActive] ? `command-${safeActive}` : undefined
              }
              aria-describedby="command-tip"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive(Math.min(items.length - 1, safeActive + 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive(Math.max(0, safeActive - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  go(safeActive);
                }
              }}
              className={styles.input}
            />
            <Kbd>Esc</Kbd>
          </div>
          <p id="command-tip" className={styles.tip}>
            {m.nav.commandTip}
          </p>
          <ul
            id="command-list"
            role="listbox"
            aria-label={m.nav.commandHint}
            className={styles.list}
            aria-busy={searching || undefined}
          >
            {items.length === 0 ? (
              <li className={styles.empty}>
                {searching
                  ? m.nav.commandSearching
                  : people.isError && q
                    ? m.nav.commandSearchFailed
                    : m.nav.commandEmpty}
              </li>
            ) : null}
            {items.map((item, index) => {
              const Icon = item.icon;
              const showSection =
                index === 0 || items[index - 1]?.section !== item.section;
              return (
                <li key={item.key} role="presentation">
                  {showSection ? (
                    <p className={styles.section} role="presentation">
                      {item.section}
                    </p>
                  ) : null}
                  <div
                    id={`command-${index}`}
                    role="option"
                    aria-selected={index === safeActive}
                    className={styles.item}
                    onPointerMove={() => setActive(index)}
                    onClick={() => go(index)}
                  >
                    <span
                      className={styles.icon}
                      aria-hidden="true"
                      data-avatar={item.avatar ? "" : undefined}
                    >
                      {item.avatar ? (
                        <Avatar name={item.avatar} size="sm" decorative />
                      ) : Icon ? (
                        <Icon />
                      ) : null}
                    </span>
                    <span className={styles.label}>{item.label}</span>
                    {item.detail ? (
                      <span className={styles.detail}>{item.detail}</span>
                    ) : null}
                    {index === safeActive ? (
                      <CornerDownLeft
                        aria-hidden="true"
                        className={styles.enter}
                      />
                    ) : null}
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
