import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { Schema } from "@metrivum/api-client-web";
import { Dumbbell, FileText, UserRound } from "lucide-react";
import {
  Avatar,
  Button,
  DataTable,
  Dialog,
  EmptyState,
} from "@portable-ui/react";
import { Facts, Panel } from "~/shared/ui/Panel";
import { BodySummary, detailsFromValues } from "~/modules/accounts";
import { pageFromParam } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { AnswerReview, type Answers } from "../form-fields";
import { useClientDetailsUrl } from "./url";
import styles from "./client-details.module.css";

export function ClientProfile({
  relationship,
}: {
  relationship: Relationship;
}) {
  const uiCopy = useUiCopy();

  const { params, update } = useClientDetailsUrl();
  const profile = useCoachingQuery<Schema<"RelationshipProfileDto">>(
    `/api/v1/coaching/relationships/${relationship.id}/profile`,
  );
  const applications = useCoachingQuery<Page<Schema<"ApplicationDto">>>(
    `/api/v1/coaching/relationships/${relationship.id}/applications`,
    { page: pageFromParam(params.get("applicationPage") ?? "1"), pageSize: 10 },
  );
  const selected = params.get("application");
  const account: Array<[string, string | null | undefined]> = [
    [
      "Username",
      relationship.client.username ? `@${relationship.client.username}` : null,
    ],
    ["Phone", relationship.clientPhone],
  ];
  return (
    <div className={styles.stack}>
      <div className={styles.profileGrid}>
        <Panel
          title={uiCopy["settings"]["identity"]}
          icon={<UserRound />}
          tone="blue"
        >
          <div className={styles.accountHero}>
            <Avatar
              name={
                relationship.client.displayName ||
                relationship.client.username ||
                "Client"
              }
              size="lg"
              decorative
            />
            <div>
              <strong>
                {relationship.client.displayName ||
                  uiCopy["profile"]["roles"]["Client"]}
              </strong>
              {relationship.client.username ? (
                <span>@{relationship.client.username}</span>
              ) : null}
            </div>
          </div>
          <Facts
            items={[
              ...account.map(([label, value]) => ({
                label,
                value: value || (
                  <span className={styles.muted}>
                    {uiCopy["ui"]["Not shared"]}
                  </span>
                ),
              })),
              {
                label: uiCopy["ui"]["Collaboration"],
                value: <StatusBadge status={relationship.status} />,
              },
              {
                label: uiCopy["ui"]["Client since"],
                value: new Date(relationship.startedAt).toLocaleDateString(),
              },
            ]}
          />
        </Panel>
        <Panel
          title={uiCopy["profile"]["details"]}
          icon={<Dumbbell />}
          tone="green"
          description={
            uiCopy["ui"]["What the client currently shares with you."]
          }
        >
          {profile.isPending ? (
            <Loading />
          ) : profile.isError ? (
            <Failure
              error={profile.error}
              retry={() => void profile.refetch()}
            />
          ) : (
            <BodySummary
              details={detailsFromValues(
                profile.data.currentAllowedProfile as Record<string, unknown>,
              )}
              empty="The client has not shared any training or body details yet."
            />
          )}
        </Panel>
      </div>
      <Panel
        title={uiCopy["access"]["features"]["forms.application.manage"]}
        icon={<FileText />}
        tone="violet"
        description={
          uiCopy["ui"][
            "Original submissions. Later profile changes do not alter these answers."
          ]
        }
        flush
      >
        {applications.isPending ? (
          <Loading />
        ) : applications.isError ? (
          <Failure
            error={applications.error}
            retry={() => void applications.refetch()}
          />
        ) : !applications.data.items.length ? (
          <p className={styles.empty}>
            {uiCopy["ui"]["No application forms linked to this collaboration."]}
          </p>
        ) : (
          <>
            <DataTable
              label={uiCopy["ui"]["Original application forms"]}
              rows={applications.data.items}
              rowKey={(a) => a.id}
              columns={[
                {
                  id: "offer",
                  header: "Offer",
                  cell: (a) => (
                    <button
                      type="button"
                      data-row-link
                      className={styles.rowButton}
                      onClick={() => update({ application: a.id })}
                    >
                      {a.offerName}
                    </button>
                  ),
                },
                {
                  id: "date",
                  header: "Submitted",
                  cell: (a) =>
                    a.submittedAt
                      ? new Date(a.submittedAt).toLocaleDateString()
                      : "Not submitted",
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (a) => <StatusBadge status={a.status} />,
                },
                {
                  id: "view",
                  header: (
                    <span className="tf-visually-hidden">
                      {uiCopy["ui"]["Responses"]}
                    </span>
                  ),
                  align: "end",
                  cell: (a) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => update({ application: a.id })}
                    >
                      {uiCopy["ui"]["View responses"]}
                    </Button>
                  ),
                },
              ]}
            />
            {Number(applications.data.total) >
            Number(applications.data.pageSize) ? (
              <ListPagination
                data={applications.data}
                onChange={(page) => update({ applicationPage: String(page) })}
              />
            ) : null}
          </>
        )}
      </Panel>
      {selected && (
        <Dialog
          isOpen
          placement="right"
          size="lg"
          title={uiCopy["ui"]["Original application"]}
          onOpenChange={(open) => {
            if (!open) update({ application: null });
          }}
        >
          <ApplicationResponses
            id={selected}
            relationshipId={relationship.id}
          />
        </Dialog>
      )}
    </div>
  );
}

function ApplicationResponses({
  id,
  relationshipId,
}: {
  id: string;
  relationshipId: string;
}) {
  const uiCopy = useUiCopy();

  const query = useCoachingQuery<Schema<"CoachApplicationDetailDto">>(
    `/api/v1/coaching/relationships/${relationshipId}/applications/${id}`,
  );
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const d = query.data.detail;
  if (!d || d.application.relationshipId !== relationshipId)
    return (
      <EmptyState
        title={uiCopy["ui"]["Application is not part of this collaboration"]}
      />
    );
  return (
    <div className={styles.stack}>
      <Facts
        items={[
          {
            label: uiCopy["ui"]["Form"],
            value: d.formVersion?.name ?? "No application form",
          },
          { label: uiCopy["ui"]["Offer"], value: d.application.offerName },
          {
            label: uiCopy["ui"]["Form version"],
            value: d.formVersion?.number ?? "—",
          },
          {
            label: uiCopy["usage"]["colState"],
            value: <StatusBadge status={d.application.status} />,
          },
        ]}
      />
      {d.formVersion && (
        <AnswerReview
          definition={d.formVersion.definition}
          answers={d.answers as Answers}
        />
      )}
    </div>
  );
}
