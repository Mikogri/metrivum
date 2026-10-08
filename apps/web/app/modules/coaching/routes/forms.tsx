import { Plus } from "lucide-react";
import { Link, Navigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Button, DataTable, LinkButton, EmptyState, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useAccessSnapshot } from "~/shared/access";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import styles from "../coaching.module.css";

export default function Forms() {
  const [state, update] = useUrlState({ purpose: "Application", q: "", page: "1", sort: "updated", archived: "false", create: "" });
  const access = useAccessSnapshot();
  const purpose = state.purpose === "CheckIn" ? "CheckIn" : "Application";
  const allowed = access.data?.features.some((f) => f.key === (purpose === "Application" ? "forms.application.manage" : "forms.checkin.manage") && f.available) === true;
  const createHref = `/app/forms/new?purpose=${purpose}`;
  const list = useCoachingQuery<Page<Schema<"FormTemplateDto">>>("/api/v1/forms", { purpose, search: state.q || undefined, sort: state.sort, archived: state.archived === "true", page: pageFromParam(state.page), pageSize: 20 }, allowed);
  // Older links open the builder screen directly.
  if (state.create === "1") return <Navigate to={createHref} replace />;
  return <><PageHeader title="Forms" description="Create application questionnaires and recurring check-in forms." actions={allowed && <LinkButton href={createHref} variant="primary" iconStart={<Plus />}>Create form</LinkButton>} />
    <Toolbar aria-label="Filter forms" className={styles.toolbar}><Select aria-label="Form purpose" selectedKey={purpose} onSelectionChange={(key) => update({ purpose: String(key) })}><Option id="Application">Application forms</Option><Option id="CheckIn">Check-in forms</Option></Select>
      <SearchInput aria-label="Search forms" value={state.q} onChange={(q) => update({ q })} placeholder="Find a form" />
      <Select aria-label="Sort forms" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}><Option id="updated">Recently updated</Option><Option id="name">Name</Option></Select>
      <Select aria-label="Form visibility" selectedKey={state.archived} onSelectionChange={(key) => update({ archived: String(key) })}><Option id="false">Current forms</Option><Option id="true">Archived forms</Option></Select>
    </Toolbar>
    {access.isPending ? <Loading /> : !allowed ? <EmptyState title="Form management is unavailable" description="Your current account needs access to manage this type of form." /> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title="Build your first form" description="Start with a few questions. Publish when it is ready to use in an offer or check-in." actions={<LinkButton href={createHref} variant="primary" iconStart={<Plus />}>Create form</LinkButton>} /> : <>
      <DataTable label="Forms" rows={list.data.items} rowKey={(f) => f.id} columns={[
        { id: "name", header: "Form", cell: (f) => <Link data-row-link to={`/app/forms/${f.id}`}>{f.name}</Link> },
        { id: "description", header: "Description", cell: (f) => f.description, muted: true, hideOnMobile: true },
        { id: "status", header: "Status", cell: (f) => <StatusBadge status={f.archived ? "Archived" : f.currentPublishedVersionId ? "Published" : "Draft"} /> },
        { id: "updated", header: "Updated", cell: (f) => new Date(f.updatedAt).toLocaleDateString(), hideOnMobile: true },
      ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {access.isError && <Button onPress={() => void access.refetch()}>Retry access check</Button>}
  </>;
}
