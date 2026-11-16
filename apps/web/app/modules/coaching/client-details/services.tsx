import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { CreditCard, Receipt } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Button,
  Dialog,
  Option,
  Select,
  TextField,
  Toolbar,
} from "@portable-ui/react";
import { Facts, Panel } from "~/shared/ui/Panel";
import { useFeatureAccess } from "~/shared/access";
import { pageFromParam } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { money } from "../pricing";
import { RelationshipBilling } from "../settlements";
import { endExclusive, useClientDetailsUrl } from "./url";
import styles from "./client-details.module.css";

export function ClientServices({ relationshipId }: { relationshipId: string }) {
  const uiCopy = useUiCopy();

  const { params, update } = useClientDetailsUrl();
  const query = useCoachingQuery<Page<Schema<"RelationshipServiceDto">>>(
    `/api/v1/coaching/relationships/${relationshipId}/services`,
    {
      status: "Active",
      page: pageFromParam(params.get("servicePage") ?? "1"),
      pageSize: 10,
    },
  );
  return (
    <Panel
      title={uiCopy["ui"]["Current services"]}
      icon={<Receipt />}
      tone="orange"
      flush
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <p className={styles.empty}>
          {
            uiCopy["ui"][
              "No active services. Accepted offers appear here with their original terms."
            ]
          }
        </p>
      ) : (
        <>
          <ul className={styles.rows}>
            {query.data.items.map((service) => {
              const billing = service.offerRevision.billingOptions.find(
                (option) => option.id === service.billingOptionId,
              );
              const current = service.currentBilling;
              return (
                <li key={service.id} className={styles.itemRow}>
                  <div className={styles.itemMain}>
                    <Link
                      to={`/app/services/${service.id}`}
                      className={styles.itemTitle}
                    >
                      {service.offerName}
                    </Link>
                    <span className={styles.itemMeta}>
                      {service.offerRevision.coachingMode} ·{" "}
                      {billing?.name ?? billing?.model} ·{" "}
                      {money(service.amount, service.currency)}
                      {current?.nextDueAt &&
                      current.nextDueAmount != null &&
                      current.currency
                        ? ` · Next due ${new Date(current.nextDueAt).toLocaleDateString()}`
                        : ""}
                      {current?.validUntil
                        ? ` · ${current.isExpired ? "Expired" : "Valid until"} ${new Date(current.validUntil).toLocaleString()}`
                        : ""}
                      {current?.remainingSessions != null
                        ? ` · ${current.remainingSessions} sessions left`
                        : ""}
                    </span>
                  </div>
                  <div className={styles.itemSide}>
                    {current ? (
                      <StatusBadge status={current.status} />
                    ) : (
                      <StatusBadge status={service.status} />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        update({
                          drawer: "payments",
                          payService: service.id,
                          payPage: null,
                        })
                      }
                    >
                      {uiCopy["ui"]["Payments"]}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {Number(query.data.total) > Number(query.data.pageSize) ? (
            <ListPagination
              data={query.data}
              onChange={(page) => update({ servicePage: String(page) })}
            />
          ) : null}
        </>
      )}
    </Panel>
  );
}
export function ClientPaymentSummary({
  relationshipId,
}: {
  relationshipId: string;
}) {
  const uiCopy = useUiCopy();

  const access = useFeatureAccess("billing.manage");
  const query = useCoachingQuery<Schema<"RelationshipBillingDto">>(
    `/api/v1/coaching/relationships/${relationshipId}/billing`,
    { page: 1, pageSize: 1 },
    access.allowed,
  );
  const { update } = useClientDetailsUrl();
  if (!access.allowed) return null;
  const s = query.data?.summary;
  const overdue = s?.overdueByCurrency ?? [];
  return (
    <Panel
      title={uiCopy["ui"]["Payments"]}
      icon={<CreditCard />}
      tone="rose"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            update({ drawer: "payments", payService: null, payPage: null })
          }
        >
          {uiCopy["ui"]["View history"]}
        </Button>
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <Facts
          items={[
            {
              label: uiCopy["ui"]["Last settlement"],
              value: s?.lastSettlement
                ? `${money(s.lastSettlement.grossAmount, s.lastSettlement.currency)} · ${new Date(s.lastSettlement.settledAt).toLocaleDateString()}`
                : "No settled payments",
            },
            {
              label: uiCopy["ui"]["Next due"],
              value: s?.nextDue
                ? `${money(s.nextDue.amount, s.nextDue.currency)} · ${new Date(s.nextDue.dueAt).toLocaleDateString()}`
                : "Nothing scheduled",
            },
            {
              label: uiCopy["ui"]["Overdue"],
              value: overdue.length
                ? overdue
                    .map(
                      (item) =>
                        `${item.count} · ${money(item.amount, item.currency)}`,
                    )
                    .join(", ")
                : "None",
            },
          ]}
        />
      )}
    </Panel>
  );
}
export function PaymentHistoryDrawer({
  relationshipId,
}: {
  relationshipId: string;
}) {
  const uiCopy = useUiCopy();

  const { params, update } = useClientDetailsUrl();
  const [servicePage, setServicePage] = useState(1);
  const services = useCoachingQuery<Page<Schema<"RelationshipServiceDto">>>(
    `/api/v1/coaching/relationships/${relationshipId}/services`,
    { page: servicePage, pageSize: 20 },
  );
  const filter = (patch: Record<string, string | null>) =>
    update({ ...patch, payPage: null });
  const serviceId = params.get("payService");
  return (
    <Dialog
      isOpen
      placement="right"
      size="xl"
      title={uiCopy["ui"]["Payment history"]}
      description={
        uiCopy["ui"][
          "Client service dues and settlements in this collaboration."
        ]
      }
      onOpenChange={(open) => {
        if (!open) update({ drawer: null });
      }}
    >
      <div className={styles.stack}>
        {services.isError ? (
          <Failure
            error={services.error}
            retry={() => void services.refetch()}
          />
        ) : null}
        <Toolbar
          aria-label={uiCopy["ui"]["Payment filters"]}
          className={styles.payFilters}
        >
          <Select
            label={uiCopy["ui"]["Service"]}
            selectedKey={serviceId || "all"}
            onSelectionChange={(key) =>
              filter({ payService: key === "all" ? null : String(key) })
            }
          >
            <Option id="all">{uiCopy["ui"]["All services"]}</Option>
            {serviceId &&
            !services.data?.items.some((s) => s.id === serviceId) ? (
              <Option id={serviceId}>{uiCopy["ui"]["Selected service"]}</Option>
            ) : null}
            {(services.data?.items ?? []).map((s) => (
              <Option key={s.id} id={s.id}>
                {s.offerName}
              </Option>
            ))}
          </Select>
          <Select
            label={uiCopy["usage"]["colState"]}
            selectedKey={params.get("payStatus") || "all"}
            onSelectionChange={(key) =>
              filter({ payStatus: key === "all" ? null : String(key) })
            }
          >
            <Option id="all">{uiCopy["ui"]["All statuses"]}</Option>
            <Option id="AwaitingPayment">
              {uiCopy["ui"]["Awaiting payment"]}
            </Option>
            <Option id="Paid">{uiCopy["ui"]["Paid"]}</Option>
            <Option id="Cancelled">
              {uiCopy["video"]["statuses"]["Cancelled"]}
            </Option>
          </Select>
          <TextField
            label={uiCopy["editor"]["panel"]["loadMin"]}
            type="date"
            value={params.get("payFrom") || ""}
            onChange={(v) => filter({ payFrom: v })}
          />
          <TextField
            label={uiCopy["editor"]["panel"]["loadMax"]}
            type="date"
            value={params.get("payTo") || ""}
            onChange={(v) => filter({ payTo: v })}
          />
        </Toolbar>
        {services.data && Number(services.data.total) > 20 && (
          <ListPagination data={services.data} onChange={setServicePage} />
        )}
        <RelationshipBilling
          bare
          relationshipId={relationshipId}
          filters={{
            status: params.get("payStatus") || undefined,
            serviceId: serviceId || undefined,
            from: params.get("payFrom") || undefined,
            to: endExclusive(params.get("payTo")),
            sort: "latest",
          }}
          page={pageFromParam(params.get("payPage") ?? "1")}
          onPageChange={(page) => update({ payPage: String(page) })}
        />
      </div>
    </Dialog>
  );
}
