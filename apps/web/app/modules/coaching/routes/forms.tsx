import { FileText, Plus } from "lucide-react";
import { Link, Navigate } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Button, DataTable, LinkButton, EmptyState, Option, PageHeader, SearchInput, Select, Toolbar, toast } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useAccessSnapshot } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { CardGrid, ListCard } from "~/shared/library/DataView";
import { LibraryViewToggle, useLibraryView } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export default function Forms() {
  const [state, update] = useUrlState({ purpose: "Application", q: "", page: "1", sort: "updated", archived: "false", create: "", view: "list" });
  const view = useLibraryView(state.view);
  const restore = useCoachingMutation(() => toast({ tone: "success", title: "Form restored" }));
  const restoreForm = (form: Schema<"FormTemplateDto">) => restore.mutate({ method: "POST", path: `/api/v1/forms/${form.id}/restore`, ifMatch: form.version });
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
      <LibraryViewToggle value={view === "cards" ? "cards" : "list"} onChange={(view) => update({ view, page: state.page })} />
    </Toolbar>
    <MutationError error={restore.error} />
    {access.isPending ? <Loading /> : !allowed ? <EmptyState title="Form management is unavailable" description="Your current account needs access to manage this type of form." /> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title={state.archived === "true" ? "No archived forms" : state.q ? "No matching forms" : "Build your first form"} description={state.archived === "true" ? "Archived forms appear here and can be restored anytime." : "Start with a few questions. Publish when it is ready to use in an offer or check-in."} actions={<LinkButton href={createHref} variant="primary" iconStart={<Plus />}>Create form</LinkButton>} /> : <>
      {view === "cards" ? <CardGrid label="Forms">{list.data.items.map((f) => <ListCard key={f.id} href={`/app/forms/${f.id}`} title={f.name} icon={<FileText />} tone={purpose === "Application" ? "blue" : "violet"} badge={<StatusBadge status={f.archived ? "Archived" : f.currentPublishedVersionId ? "Published" : "Draft"} />} description={f.description || undefined} meta={[`Updated ${new Date(f.updatedAt).toLocaleDateString()}`]} actions={f.archived ? <Button size="sm" loading={restore.isPending && restore.variables?.path === `/api/v1/forms/${f.id}/restore`} isDisabled={restore.isPending} onPress={() => restoreForm(f)}>Restore form</Button> : undefined} />)}</CardGrid>: <DataTable label="Forms" rows={list.data.items} rowKey={(f) => f.id} columns={[
        { id: "name", header: "Form", cell: (f) => <Link data-row-link to={`/app/forms/${f.id}`}>{f.name}</Link> },
        { id: "description", header: "Description", cell: (f) => f.description, muted: true, hideOnMobile: true },
        { id: "status", header: "Status", cell: (f) => <StatusBadge status={f.archived ? "Archived" : f.currentPublishedVersionId ? "Published" : "Draft"} /> },
        { id: "updated", header: "Updated", cell: (f) => new Date(f.updatedAt).toLocaleDateString(), hideOnMobile: true },
        { id: "actions", header: <span className="tf-visually-hidden">Actions</span>, align: "end", cell: (f) => f.archived ? <Button size="sm" loading={restore.isPending && restore.variables?.path === `/api/v1/forms/${f.id}/restore`} isDisabled={restore.isPending} onPress={() => restoreForm(f)}>Restore form</Button> : null },
      ]} />}<ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {access.isError && <Button onPress={() => void access.refetch()}>Retry access check</Button>}
  </>;
}
