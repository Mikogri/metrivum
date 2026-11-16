import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useEffect, useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Option, SearchInput, Select } from "@portable-ui/react";
import { useCoachingQuery, type Page } from "./api";
import { Failure, ListPagination } from "./components";

export function PlanDeliverySelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const uiCopy = useUiCopy();

  const [planId, setPlanId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const plans = useCoachingQuery<Page<Schema<"PlanListItem">>>(
    "/api/v1/training/programs",
    { kind: "Program", page, pageSize: 20, search },
  );
  const revisions = useCoachingQuery<Page<Schema<"RevisionListItem">>>(
    `/api/v1/training/programs/${planId}/revisions`,
    { page: 1, pageSize: 1 },
    !!planId,
  );
  useEffect(() => {
    onChange(revisions.data?.items[0]?.id ?? null);
  }, [revisions.data, onChange]);
  return (
    <>
      <SearchInput
        aria-label={uiCopy["ui"]["Search delivery plans"]}
        placeholder={uiCopy["ui"]["Search plans"]}
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />
      <Select
        label={uiCopy["ui"]["Plan to deliver after payment"]}
        selectedKey={planId || null}
        onSelectionChange={(key) => {
          onChange(null);
          setPlanId(String(key));
        }}
      >
        {(plans.data?.items ?? []).map((plan) => (
          <Option id={plan.id} key={plan.id}>
            {plan.name}
          </Option>
        ))}
      </Select>
      {plans.data && plans.data.total > plans.data.pageSize && (
        <ListPagination data={plans.data} onChange={setPage} />
      )}
      {plans.isError && <Failure error={plans.error} />}
      {planId && revisions.isError && <Failure error={revisions.error} />}
      {planId && revisions.data && !value && (
        <Alert
          tone="warning"
          title={uiCopy["ui"]["Apply changes to this plan first"]}
        >
          {uiCopy["ui"]["The purchase must deliver an applied version."]}
        </Alert>
      )}
      {value && (
        <p>
          {
            uiCopy["ui"][
              "The current applied version is frozen for this purchase. The client cannot preview it before payment."
            ]
          }
        </p>
      )}
    </>
  );
}
