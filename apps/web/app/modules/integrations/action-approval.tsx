import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, PageHeader, Skeleton } from "@metrivum/ui-web";
import { useAccountContext } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import {
  useIntegrationMutation,
  useIntegrationQuery,
  type Action,
} from "./api";
import { IntegrationError } from "./integrations";
import styles from "./integrations.module.css";
import { useIntegrationCopy } from "./copy";

export const meta = () => privateMeta("Review assistant action — Metrivum");

export default function ActionApproval() {
  const uiCopy = useUiCopy();
  const copy = useIntegrationCopy();

  const { actionId = "" } = useParams();
  const path = `/api/v1/me/ai-actions/${encodeURIComponent(actionId)}`;
  const cache = useQueryClient();
  const { accountKey } = useAccountContext();
  const query = useIntegrationQuery<Action>(path, undefined, !!actionId);
  const save = useIntegrationMutation<Action>((data) =>
    cache.setQueryData([accountKey, "integrations", path, undefined], data),
  );
  const action = query.data;
  const assignment =
    action?.type === "AssignProgram" ? action.assignment : null;
  const supported = action?.type === "SendMessage" || !!assignment;
  const canApprove =
    supported &&
    action?.status === "Pending" &&
    new Date(action.expiresAt).getTime() > Date.now();
  return (
    <div className={`${styles.stack} ${styles.page}`}>
      <PageHeader
        title={uiCopy["ui"]["Review assistant action"]}
        description={
          assignment
            ? copy.assignmentIntro
            : uiCopy["ui"][
                "Review the exact recipients and message before sending."
              ]
        }
      />
      {!actionId ? (
        <Alert tone="danger" title={uiCopy["ui"]["Missing action ID"]} />
      ) : query.isPending ? (
        <Skeleton height="10rem" />
      ) : query.error ? (
        <>
          <IntegrationError error={query.error} />
          <Button onPress={() => void query.refetch()}>
            {uiCopy["ui"]["Reload action"]}
          </Button>
        </>
      ) : (
        action && (
          <Card as="section" padding="lg" className={styles.card}>
            <h2 className={styles.heading}>{action.conversationTitle}</h2>
            <p className={styles.hint}>
              {uiCopy["ui"]["Prepared by"]} {action.clientName}{" "}
              {uiCopy["ui"]["· Expires"]}{" "}
              {new Date(action.expiresAt).toLocaleString()}
            </p>
            {assignment ? (
              <>
                <dl>
                  <dt>{copy.client}</dt>
                  <dd>
                    {assignment.clientName} ({assignment.clientId})
                  </dd>
                  <dt>{copy.program}</dt>
                  <dd>
                    {assignment.programName} ({assignment.request.programId})
                  </dd>
                  <dt>{copy.version}</dt>
                  <dd>
                    {assignment.publishedVersion} (
                    {assignment.request.revisionId})
                  </dd>
                  <dt>{copy.start}</dt>
                  <dd>{assignment.request.startDate}</dd>
                  <dt>{copy.zone}</dt>
                  <dd>{assignment.request.timeZone}</dd>
                </dl>
                <h3>{copy.current}</h3>
                {assignment.currentAssignments.length ? (
                  <ul>
                    {assignment.currentAssignments.map((item) => (
                      <li key={item.id}>
                        {item.programName} · {item.status} · {item.version}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{copy.none}</p>
                )}
                <Alert tone="info" title={copy.effect} />
              </>
            ) : (
              <>
                <h3>{uiCopy["ui"]["Recipients"]}</h3>
                <ul>
                  {action.recipients.map((recipient) => (
                    <li key={recipient.userId}>{recipient.displayName}</li>
                  ))}
                </ul>
                <h3>{uiCopy["profile"]["message"]}</h3>
                <p className={styles.preview}>{action.body}</p>
              </>
            )}
            <IntegrationError error={save.error} />
            {!supported ? (
              <Alert
                tone="info"
                title={
                  uiCopy["ui"][
                    "This action type is not supported by this review screen"
                  ]
                }
              />
            ) : action.status === "Executed" ? (
              <Alert
                tone="success"
                title={
                  assignment ? copy.assigned : uiCopy["ui"]["Message sent"]
                }
              />
            ) : action.status === "Approved" ? (
              <Alert
                tone="info"
                title={
                  uiCopy["ui"]["Approved; awaiting execution by your assistant"]
                }
              />
            ) : action.status === "Rejected" ? (
              <Alert tone="info" title={uiCopy["ui"]["Action rejected"]} />
            ) : !canApprove ? (
              <Alert
                tone="info"
                title={uiCopy["ui"]["This action has expired"]}
              />
            ) : (
              <>
                <p className={styles.hint}>
                  {assignment
                    ? copy.assignmentNotice
                    : uiCopy["ui"][
                        "Send creates one normal chat message to these recipients. Your assistant cannot change this approved text."
                      ]}
                </p>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    loading={save.isPending}
                    onPress={() =>
                      save.mutate({
                        method: "POST",
                        path: `${path}/approve`,
                        json: { expectedVersion: action.version },
                      })
                    }
                  >
                    {assignment
                      ? copy.approve
                      : uiCopy["ui"]["Send this message"]}
                  </Button>
                  <Button
                    isDisabled={save.isPending}
                    onPress={() =>
                      save.mutate({
                        method: "POST",
                        path: `${path}/reject`,
                        json: { expectedVersion: action.version },
                      })
                    }
                  >
                    {uiCopy["ui"]["Reject"]}
                  </Button>
                </div>
              </>
            )}
            {action.status === "Approved" && (
              <Button
                isDisabled={save.isPending}
                onPress={() =>
                  save.mutate({
                    method: "POST",
                    path: `${path}/reject`,
                    json: { expectedVersion: action.version },
                  })
                }
              >
                {uiCopy["ui"]["Reject"]}
              </Button>
            )}
            <Button
              isDisabled={save.isPending || query.isFetching}
              onPress={() => {
                save.reset();
                void query.refetch();
              }}
            >
              {uiCopy["ui"]["Reload current action"]}
            </Button>
          </Card>
        )
      )}
      <Link to="/app/settings?section=integrations">
        {uiCopy["ui"]["Back to integrations"]}
      </Link>
    </div>
  );
}
