import { useRef } from "react";
import { Link } from "react-router";
import { BadgePercent, Plus } from "lucide-react";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, DataTable, Dialog, EmptyState, LinkButton, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { OfferEditor } from "../offer-editor";
import styles from "../coaching.module.css";

function Offers() {
  const [state, update] = useUrlState({ q: "", status: "", sort: "updated", page: "1", create: "", scope: "personal" });
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const team = state.scope === "team" && context.data?.isActive ? context.data : null;
  const available = state.scope !== "team" || team != null;
  const list = useCoachingQuery<Page<Schema<"OfferDto">>>("/api/v1/offers", { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort, teamId: team?.teamId }, available);
  const dirty = useRef(false);
  const { confirm, dialog } = useDiscardConfirm();
  const creating = state.create === "1";
  const close = async () => {
    if (dirty.current && !(await confirm())) return;
    dirty.current = false;
    update({ create: "", page: state.page });
  };
  const open = () => update({ create: "1", page: state.page });
  const filtered = Boolean(state.q || state.status);
  return (
    <>
      <PageHeader
        title="Offers"
        description={team ? `${team.name} organizational offers. Applicants consent to Team ownership before submitting.` : "Your private coaching services, application forms and billing options."}
        actions={
          <Button variant="primary" iconStart={<Plus />} onPress={open} isDisabled={!available}>
            Create offer
          </Button>
        }
      />
      <Toolbar aria-label="Filter offers" className={styles.toolbar}>
        <Select aria-label="Offer ownership" selectedKey={team ? "team" : "personal"} onSelectionChange={key => update({ scope: String(key) })} isDisabled={creating}>
          <Option id="personal">Personal</Option>{context.data?.isActive && <Option id="team">Team · {context.data.name}</Option>}
        </Select>
        <SearchInput aria-label="Search offers" value={state.q} onChange={(q) => update({ q })} placeholder="Find an offer" className={styles.search} />
        <Select aria-label="Offer status" selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key) })}>
          <Option id="all">All statuses</Option>
          {["Draft", "Active", "Inactive", "Archived"].map((s) => (
            <Option id={s} key={s}>{s}</Option>
          ))}
        </Select>
        <Select aria-label="Sort offers" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}>
          <Option id="updated">Recently updated</Option>
          <Option id="name">Name</Option>
        </Select>
      </Toolbar>
      {!available && context.isPending ? <Loading /> : !available && context.isError ? <Failure error={context.error} retry={() => void context.refetch()} /> : !available && !context.isPending ? <Alert tone="warning" title="Team offers are unavailable">An active Team membership is required. <Button onPress={() => update({ scope: "personal", create: "" })}>Open personal offers</Button></Alert> : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState
          icon={<BadgePercent />}
          title={filtered ? "No matching offers" : "Share what you offer"}
          description={filtered ? "Try another search or status." : "Describe your coaching, connect a published application form and set the price."}
          actions={
            filtered ? null : (
              <>
                <LinkButton href="/app/forms">Open forms</LinkButton>
                <Button variant="primary" iconStart={<Plus />} onPress={open}>
                  Create offer
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          <DataTable
            label="Offers"
            rows={list.data.items}
            rowKey={(o) => o.id}
            columns={[
              { id: "name", header: "Offer", cell: (o) => <Link data-row-link to={`/app/offers/${o.id}`}>{o.name}</Link> },
              { id: "category", header: "Category", cell: (o) => o.category, hideOnMobile: true, muted: true },
              { id: "mode", header: "Mode", cell: (o) => o.coachingMode },
              { id: "options", header: "Billing options", cell: (o) => o.billingOptions.length, hideOnMobile: true },
              { id: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
            ]}
          />
          <ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} />
        </>
      )}
      {dialog}
      <Dialog
        title="New offer"
        description="Saved as a draft. Publish it from the offer page when the terms are ready."
        size="lg"
        isOpen={creating && available}
        onOpenChange={(isOpen) => {
          if (!isOpen) void close();
        }}
      >
        {creating ? <OfferEditor ownership={team ? { id: team.teamId, name: team.name } : undefined} panel={{ close: () => void close() }} onDirtyChange={(value) => (dirty.current = value)} /> : null}
      </Dialog>
    </>
  );
}

export default function OffersRoute() {
  return (
    <RequireFeature feature="offers.manage">
      <Offers />
    </RequireFeature>
  );
}
