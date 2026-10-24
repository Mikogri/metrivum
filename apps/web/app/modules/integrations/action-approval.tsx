import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, PageHeader, Skeleton } from "@trainflow/ui-web";
import { useAccountContext } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import { useIntegrationMutation, useIntegrationQuery, type Action } from "./api";
import { IntegrationError } from "./integrations";
import styles from "./integrations.module.css";

export const meta = () => privateMeta("Review assistant action — Metrivum");

export default function ActionApproval() {
  const { actionId = "" } = useParams();
  const path = `/api/v1/me/ai-actions/${encodeURIComponent(actionId)}`;
  const cache = useQueryClient();
  const { accountKey } = useAccountContext();
  const query = useIntegrationQuery<Action>(path, undefined, !!actionId);
  const save = useIntegrationMutation<Action>(data => cache.setQueryData([accountKey, "integrations", path, undefined], data));
  const action = query.data;
  const canApprove = action?.type === "SendMessage" && action.status === "Pending" && new Date(action.expiresAt).getTime() > Date.now();
  return <div className={`${styles.stack} ${styles.page}`}>
    <PageHeader title="Review assistant action" description="Review the exact recipients and message before sending." />
    {!actionId ? <Alert tone="danger" title="Missing action ID" /> : query.isPending ? <Skeleton height="10rem" /> : query.error ? <><IntegrationError error={query.error} /><Button onPress={() => void query.refetch()}>Reload action</Button></> : action && <Card as="section" padding="lg" className={styles.card}>
      <h2 className={styles.heading}>{action.conversationTitle}</h2>
      <p className={styles.hint}>Prepared by {action.clientName} · Expires {new Date(action.expiresAt).toLocaleString()}</p>
      <h3>Recipients</h3><ul>{action.recipients.map(recipient => <li key={recipient.userId}>{recipient.displayName}</li>)}</ul>
      <h3>Message</h3><p className={styles.preview}>{action.body}</p>
      <IntegrationError error={save.error} />
      {action.type !== "SendMessage" ? <Alert tone="info" title="This action type is not supported by this review screen" /> : action.status === "Executed" ? <Alert tone="success" title="Message sent" /> : action.status === "Approved" ? <Alert tone="info" title="Approved; awaiting execution by your assistant" /> : action.status === "Rejected" ? <Alert tone="info" title="Action rejected" /> : !canApprove ? <Alert tone="info" title="This action has expired" /> : <>
        <p className={styles.hint}>Send creates one normal chat message to these recipients. Your assistant cannot change this approved text.</p>
        <div className={styles.actions}><Button variant="primary" loading={save.isPending} onPress={() => save.mutate({ method: "POST", path: `${path}/approve`, json: { expectedVersion: action.version } })}>Send this message</Button><Button isDisabled={save.isPending} onPress={() => save.mutate({ method: "POST", path: `${path}/reject`, json: { expectedVersion: action.version } })}>Reject</Button></div>
      </>}
      <Button isDisabled={save.isPending || query.isFetching} onPress={() => { save.reset(); void query.refetch(); }}>Reload current action</Button>
    </Card>}
    <Link to="/app/settings?section=integrations">Back to integrations</Link>
  </div>;
}
