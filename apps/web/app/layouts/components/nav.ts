import { clientSection, clientSections } from "~/shared/session/workspace-model";
import { AnalyzeIcon, CalendarIcon, ClientsIcon, DashboardIcon, EarningsIcon, ExercisesIcon, FormsIcon, FormulasIcon, MessagesIcon, OffersIcon, ProgramsIcon, SettingsIcon, VideoAnalysesIcon } from "./navIcons";
import type { AppMessages } from "~/shared/i18n/messages/app.en";

export function appNavGroups(m: AppMessages, roles: readonly string[] = ["Coach", "Client"]) {
  const coach = roles.includes("Coach");
  if (!coach)
    return [
      {
        id: "client-general",
        label: m.nav.groups.general,
        items: [
          { to: "/app/my-training", label: "My training", icon: ProgramsIcon },
          { to: "/app/calendar", label: "Calendar", icon: CalendarIcon },
          { to: "/app/messages", label: "Messages", icon: MessagesIcon },
          { to: "/app/team", label: "Team", icon: ClientsIcon },
        ],
      },
      {
        id: "client-coaching",
        label: "Coaching",
        items: [
          { to: "/app/my-coaches", label: "Coaches", icon: ClientsIcon },
          ...(roles.includes("Client")
            ? [
                { to: "/app/my-applications", label: "Applications", icon: FormsIcon },
                { to: "/app/my-invitations", label: "Invitations", icon: OffersIcon },
              ]
            : []),
        ],
      },
      ...(roles.includes("Client")
        ? [
            {
              id: "client-progress",
              label: "Progress",
              items: [
                { to: "/app/my-check-ins", label: "Check-ins", icon: FormsIcon },
                { to: "/app/my-documents", label: "Shared documents", icon: FormsIcon },
                { to: "/app/payments", label: "Payments", icon: EarningsIcon },
              ],
            },
          ]
        : []),
    ];
  return [
    {
      id: "overview",
      label: m.nav.groups.overview,
      items: [
        { to: "/app/dashboard", label: m.nav.dashboard, icon: DashboardIcon },
        { to: "/app/analyze", label: "Analyze", icon: AnalyzeIcon },
      ],
    },
    {
      id: "training",
      label: m.nav.groups.training,
      items: [
        { to: "/app/programs", label: m.nav.programs, icon: ProgramsIcon },
        { to: "/app/video-analyses", label: m.nav.videoAnalyses, icon: VideoAnalysesIcon },
      ],
    },
    {
      id: "library",
      label: m.nav.groups.library,
      items: [
        { to: "/app/exercises", label: m.nav.exercises, icon: ExercisesIcon },
        { to: "/app/formulas", label: m.nav.formulas, icon: FormulasIcon },
        { to: "/app/forms", label: "Forms", icon: FormsIcon },
      ],
    },
    {
      id: "coaching",
      label: m.nav.groups.coaching,
      items: [
        { to: "/app/clients", label: "Clients", icon: ClientsIcon },
        { to: "/app/offers", label: "Offers", icon: OffersIcon },
        { to: "/app/calendar", label: "Calendar", icon: CalendarIcon },
        { to: "/app/messages", label: "Messages", icon: MessagesIcon },
          { to: "/app/team", label: "Team", icon: ClientsIcon },
      ],
    },
  ];
}

export function appNavItems(m: AppMessages, roles?: readonly string[]) {
  return appNavGroups(m, roles).flatMap((group) => group.items);
}

export function settingsNavItem(m: AppMessages) {
  return { to: "/app/settings", label: m.nav.settings, icon: SettingsIcon };
}

/** Labels for the app bar path, from the URL alone (entity names stay in each page's own header). */
export function pathCrumbs(m: AppMessages, pathname: string, mode: "coach" | "client" = "coach") {
  if (pathname === "/app/subscription") return [{ href: pathname, label: m.nav.subscription }];
  const hub = mode === "coach" && clientSection(pathname);
  if (hub) return [{ href: "/app/clients", label: "Clients" }, { href: hub, label: clientSections.find(([, url]) => url === hub)![0] }, ...(pathname === hub ? [] : [{ href: pathname, label: "Details" }])];
  if (mode === "coach" && pathname === "/app/templates") return [{ href: "/app/programs", label: m.nav.programs }, { href: pathname, label: m.nav.templates }];
  const items = [...appNavItems(m, mode === "coach" ? ["Coach"] : ["Client"]), settingsNavItem(m)];
  const section = items.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (!section) return [];
  const group = appNavGroups(m).find((g) => g.items.some((item) => item.to === section.to));
  const crumbs: { href: string; label: string }[] = [{ href: section.to, label: section.label }];
  const rest = pathname.slice(section.to.length).split("/").filter(Boolean)[0];
  if (rest === "new") crumbs.push({ href: pathname, label: section.to === "/app/video-analyses" ? m.nav.crumbs.newAnalysis : m.nav.crumbs.create });
  else if (rest === "compare") crumbs.push({ href: pathname, label: m.nav.crumbs.compare });
  else if (rest) {
    const [, id, mode] = pathname.slice(section.to.length).split("/");
    crumbs.push({ href: `${section.to === "/app/templates" ? "/app/programs" : section.to}/${id}`, label: m.nav.crumbs.details });
    if (mode === "edit") crumbs.push({ href: pathname, label: m.nav.crumbs.editor });
  }
  return [{ href: "", label: group?.label ?? m.nav.groups.others }, ...crumbs];
}
