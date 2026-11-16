import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useLocation, useNavigate } from "react-router";
import { Tab, TabList, Tabs } from "@portable-ui/react";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import {
  clientSection,
  clientSections,
} from "~/shared/session/workspace-model";

import styles from "./HubNavigation.module.css";

const programSections = [
  ["Programs", "/app/programs"],
  ["Templates", "/app/templates"],
] as const;

export function HubNavigation() {
  const uiCopy = useUiCopy();

  const { mode } = useWorkspace();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const client = clientSection(pathname);
  const program = programSections.find(([, url]) => pathname === url)?.[1];
  const selected = client ?? program;
  if (mode !== "coach" || !selected) return null;
  const sections = client ? clientSections : programSections;
  return (
    <Tabs
      className={styles.navigation}
      selectedKey={selected}
      onSelectionChange={(key) => navigate(String(key), { replace: true })}
    >
      <TabList
        aria-label={
          client
            ? uiCopy["ui"]["Clients sections"]
            : uiCopy["ui"]["Programs sections"]
        }
      >
        {sections.map(([label, url]) => (
          <Tab key={url} id={url}>
            {label}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
