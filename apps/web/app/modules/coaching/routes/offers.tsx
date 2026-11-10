import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Offers — Metrivum");

import { useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  Archive,
  BadgePercent,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Tag,
  Upload,
} from "lucide-react";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  LinkButton,
  Option,
  PageHeader,
  SearchInput,
  Select,
  Toolbar,
  toast,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from "@metrivum/ui-web";
import { RequireFeature } from "~/shared/access";
import { useDangerConfirm, useDiscardConfirm } from "~/shared/lib/useConfirm";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import {
  Failure,
  ListPagination,
  Loading,
  MutationError,
  StatusBadge,
} from "../components";
import { OfferEditor } from "../offer-editor";
import { money } from "../pricing";

import { CategoryTag, categoryTone } from "../offer-category";
import { CardGrid, ListCard } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

function Offers() {
  const uiCopy = useUiCopy();

  const [state, update] = useUrlState({
    q: "",
    status: "",
    sort: "updated",
    page: "1",
    create: "",
    scope: "personal",
    view: "list",
  });
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>(
    "/api/v1/me/team-context",
  );
  const team =
    state.scope === "team" && context.data?.isActive ? context.data : null;
  const available = state.scope !== "team" || team != null;
  const list = useCoachingQuery<Page<Schema<"OfferDto">>>(
    "/api/v1/offers",
    {
      page: pageFromParam(state.page),
      pageSize: 20,
      search: state.q || undefined,
      status: state.status || undefined,
      sort: state.sort,
      teamId: team?.teamId,
    },
    available,
  );
  const profile = useCoachingQuery<Schema<"AccountProfileFields">>(
    "/api/v1/me/profile-fields",
  );
  const currency = profile.data?.currency ?? "EUR";
  const dirty = useRef(false);
  const { confirm, dialog } = useDiscardConfirm();
  const creating = state.create === "1";
  const close = async () => {
    if (dirty.current && !(await confirm())) return;
    dirty.current = false;
    update({ create: "", page: state.page });
  };
  const open = () => update({ create: "1", page: state.page });
  const navigate = useNavigate();
  // One-click status changes from the list; deactivating asks first, as in the editor.
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const change = useCoachingMutation<Schema<"OfferDto">>((offer) =>
    toast({
      tone: "success",
      title:
        offer.status === "Active"
          ? "Offer is live"
          : offer.status === "Inactive"
            ? "Offer deactivated"
            : "Offer updated",
    }),
  );
  const quick = async (o: Schema<"OfferDto">, action: string) => {
    if (action === "open") return navigate(`/app/offers/${o.id}`);
    if (
      action === "archive" &&
      !(await ask({
        title: `Archive ${o.name}?`,
        body: "It disappears from your public offers and can no longer receive applications. Existing clients keep their accepted terms.",
        confirmLabel: uiCopy["ui"]["Archive offer"],
        cancelLabel: uiCopy["ui"]["Keep offer"],
      }))
    )
      return;
    if (
      action === "deactivate" &&
      !(await ask({
        title: `Deactivate ${o.name}?`,
        body: "It stops taking new applications and leaves your public offers. Current clients keep their terms, and you can activate it again later.",
        confirmLabel: uiCopy["ui"]["Deactivate offer"],
        cancelLabel: uiCopy["ui"]["Keep it open"],
      }))
    )
      return;
    change.mutate({
      method: "POST",
      path: `/api/v1/offers/${o.id}/${action}`,
      ifMatch: o.version,
    });
  };
  const offerMenu = (o: Schema<"OfferDto">) => (
    <DropdownMenuTrigger>
      <IconButton
        size="sm"
        variant="ghost"
        label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [o.name])}
        icon={<MoreHorizontal />}
        isDisabled={change.isPending}
      />
      <DropdownMenu
        aria-label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [
          o.name,
        ])}
        onAction={(key) => void quick(o, String(key))}
      >
        <DropdownMenuItem id="open" icon={<Pencil />}>
          {uiCopy["common"]["open"]}
        </DropdownMenuItem>
        {o.status === "Draft" ? (
          <DropdownMenuItem id="publish" icon={<Upload />}>
            {uiCopy["ui"]["Publish"]}
          </DropdownMenuItem>
        ) : null}
        {o.status === "Active" ? (
          <DropdownMenuItem id="deactivate" icon={<PauseCircle />}>
            {uiCopy["ui"]["Deactivate"]}
          </DropdownMenuItem>
        ) : null}
        {o.status === "Inactive" ? (
          <DropdownMenuItem id="activate" icon={<PlayCircle />}>
            {uiCopy["ui"]["Activate"]}
          </DropdownMenuItem>
        ) : null}
        {o.status !== "Archived" && o.status !== "Draft" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>
              {uiCopy["common"]["archive"]}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
  const filtered = Boolean(state.q || state.status);
  return (
    <>
      <PageHeader
        title={uiCopy["profile"]["showcase"]["offersStat"]}
        description={
          team
            ? `${team.name} organizational offers. Applicants consent to Team ownership before submitting.`
            : uiCopy["ui"][
                "Your private coaching services, application forms and billing options."
              ]
        }
        actions={
          <Button
            variant="primary"
            iconStart={<Plus />}
            onPress={open}
            isDisabled={!available}
          >
            {uiCopy["ui"]["Create offer"]}
          </Button>
        }
      />
      <Toolbar
        aria-label={uiCopy["ui"]["Filter offers"]}
        className={styles.toolbar}
      >
        <Select
          aria-label={uiCopy["ui"]["Offer ownership"]}
          selectedKey={team ? "team" : "personal"}
          onSelectionChange={(key) => update({ scope: String(key) })}
          isDisabled={creating}
        >
          <Option id="personal">{uiCopy["ui"]["Personal"]}</Option>
          {context.data?.isActive && (
            <Option id="team">
              {uiCopy["ui"]["Team ·"]} {context.data.name}
            </Option>
          )}
        </Select>
        <SearchInput
          aria-label={uiCopy["ui"]["Search offers"]}
          value={state.q}
          onChange={(q) => update({ q })}
          placeholder={uiCopy["ui"]["Find an offer"]}
          className={styles.search}
        />
        <Select
          aria-label={uiCopy["ui"]["Offer status"]}
          selectedKey={state.status || "all"}
          onSelectionChange={(key) =>
            update({ status: key === "all" ? "" : String(key) })
          }
        >
          <Option id="all">{uiCopy["ui"]["All statuses"]}</Option>
          {["Draft", "Active", "Inactive", "Archived"].map((s) => (
            <Option id={s} key={s}>
              {s}
            </Option>
          ))}
        </Select>
        <Select
          aria-label={uiCopy["ui"]["Sort offers"]}
          selectedKey={state.sort}
          onSelectionChange={(key) => update({ sort: String(key) })}
        >
          <Option id="updated">
            {uiCopy["training"]["library"]["sort"]["updated"]}
          </Option>
          <Option id="name">{uiCopy["video"]["list"]["sort"]["name"]}</Option>
        </Select>
        <LibraryViewToggle
          value={state.view === "cards" ? "cards" : "list"}
          onChange={(view) => update({ view, page: state.page })}
        />
      </Toolbar>
      {!available && context.isPending ? (
        <Loading />
      ) : !available && context.isError ? (
        <Failure error={context.error} retry={() => void context.refetch()} />
      ) : !available && !context.isPending ? (
        <Alert
          tone="warning"
          title={uiCopy["ui"]["Team offers are unavailable"]}
        >
          {uiCopy["ui"]["An active Team membership is required."]}{" "}
          <Button onPress={() => update({ scope: "personal", create: "" })}>
            {uiCopy["ui"]["Open personal offers"]}
          </Button>
        </Alert>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState
          icon={<BadgePercent />}
          title={
            filtered
              ? uiCopy["ui"]["No matching offers"]
              : uiCopy["ui"]["Share what you offer"]
          }
          description={
            filtered
              ? uiCopy["ui"]["Try another search or status."]
              : uiCopy["ui"][
                  "Describe your coaching, connect a published application form and set the price."
                ]
          }
          actions={
            filtered ? null : (
              <>
                <LinkButton href="/app/forms">
                  {uiCopy["ui"]["Open forms"]}
                </LinkButton>
                <Button variant="primary" iconStart={<Plus />} onPress={open}>
                  {uiCopy["ui"]["Create offer"]}
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          {state.view === "cards" ? (
            <CardGrid label={uiCopy["profile"]["showcase"]["offersStat"]}>
              {list.data.items.map((o) => {
                const prices = o.billingOptions
                  .map((b) => Number(b.price))
                  .filter((p) => p > 0);
                const from = prices.length ? Math.min(...prices) : null;
                return (
                  <ListCard
                    key={o.id}
                    href={`/app/offers/${o.id}`}
                    title={o.name}
                    subtitle={
                      o.teamId
                        ? `Team · ${o.teamName ?? "Organization"}`
                        : o.purpose === "TrainingPlan"
                          ? uiCopy["ui"]["Training plan"]
                          : uiCopy["ui"]["Coaching service"]
                    }
                    icon={<Tag />}
                    tone={categoryTone(o.category)}
                    menu={offerMenu(o)}
                    status={<StatusBadge status={o.status} />}
                    details={[
                      {
                        label: uiCopy["editor"]["columns"]["kind"],
                        value: <CategoryTag category={o.category} />,
                      },
                      {
                        label: uiCopy["ui"]["Mode"],
                        value:
                          o.coachingMode === "Offline"
                            ? "In person"
                            : o.coachingMode,
                      },
                      {
                        label: uiCopy["ui"]["Price"],
                        value:
                          from == null
                            ? "No price"
                            : `From ${money(from, currency)}`,
                      },
                      {
                        label: uiCopy["ui"]["Payment options"],
                        value:
                          o.billingOptions.length === 0
                            ? "None yet"
                            : o.billingOptions.length === 1
                              ? "1 option"
                              : `${o.billingOptions.length} options`,
                      },
                    ]}
                  />
                );
              })}
            </CardGrid>
          ) : (
            <DataTable
              label={uiCopy["profile"]["showcase"]["offersStat"]}
              rows={list.data.items}
              rowKey={(o) => o.id}
              columns={[
                {
                  id: "name",
                  header: "Offer",
                  cell: (o) => (
                    <Link data-row-link to={`/app/offers/${o.id}`}>
                      {o.name}
                    </Link>
                  ),
                },
                {
                  id: "category",
                  header: "Type",
                  cell: (o) => <CategoryTag category={o.category} />,
                  hideOnMobile: true,
                  muted: true,
                },
                { id: "mode", header: "Mode", cell: (o) => o.coachingMode },
                {
                  id: "options",
                  header: "Billing options",
                  cell: (o) => o.billingOptions.length,
                  hideOnMobile: true,
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (o) => <StatusBadge status={o.status} />,
                },
                {
                  id: "actions",
                  header: (
                    <span className="tf-visually-hidden">
                      {uiCopy["editor"]["sheet"]["contextLabel"]}
                    </span>
                  ),
                  width: "3.5rem",
                  align: "end",
                  cell: (o) => offerMenu(o),
                },
              ]}
            />
          )}
          <ListPagination
            data={list.data}
            onChange={(page) => update({ page: String(page) })}
          />
        </>
      )}
      {dialog}
      {confirmDialog}
      <MutationError error={change.error} />
      <Dialog
        title={uiCopy["dashboard"]["coach"]["action"]["offer"]}
        description={
          uiCopy["ui"][
            "Saved as a draft. Publish it from the offer page when the terms are ready."
          ]
        }
        size="lg"
        isOpen={creating && available}
        onOpenChange={(isOpen) => {
          if (!isOpen) void close();
        }}
      >
        {creating ? (
          <OfferEditor
            ownership={team ? { id: team.teamId, name: team.name } : undefined}
            panel={{
              close: () => void close(),
              created: () => {
                dirty.current = false;
                update({ create: "", page: state.page });
              },
            }}
            onDirtyChange={(value) => (dirty.current = value)}
          />
        ) : null}
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
