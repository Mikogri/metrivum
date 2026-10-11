import { useState } from "react";
import { useParams } from "react-router";
import { FolderOpen } from "lucide-react";
import { EmptyState, LinkButton, Option, PageHeader, Select } from "@trainflow/ui-web";
import { useCoachingQuery, type ClientRelationship, type Page } from "~/modules/coaching";
import { Failure, Loading } from "~/modules/coaching";
import { BodyMeasurements, RelationshipDocumentation } from "./relationship-documentation";
import styles from "./documentation.module.css";

export default function ClientDocuments() {
  const { relationshipId } = useParams();
  const [selected, setSelected] = useState("");
  const list = useCoachingQuery<Page<ClientRelationship>>("/api/v1/coaching/my-coaches", { pageSize: 100 }, !relationshipId);
  const id = relationshipId || selected || (list.data?.items.length === 1 ? list.data.items[0]!.id : "");
  const picker = !relationshipId && list.data && list.data.items.length > 1 ? (
    <Select aria-label="Coach" placeholder="Choose a coach" selectedKey={id || null} onSelectionChange={(k) => setSelected(String(k))} className={styles.metricSelect}>
      {list.data.items.map((r) => <Option key={r.id} id={r.id}>{`${r.coach.displayName || r.coach.username || "Coach"} · ${r.status}`}</Option>)}
    </Select>
  ) : undefined;
  return (
    <>
      <PageHeader title="Shared documents" description="Measurements, files and progress photos within each coaching relationship." actions={picker} />
      {!relationshipId && list.isPending ? <Loading /> : !relationshipId && list.isError ? <Failure error={list.error} /> : !relationshipId && !list.data?.items.length ? (
        <EmptyState icon={<FolderOpen />} title="No coaching relationship yet" description="Shared documentation lives inside a collaboration with a coach." actions={<LinkButton href="/app/my-invitations" variant="primary">View invitations</LinkButton>} />
      ) : id ? (
        <div className={styles.stack}>
          <BodyMeasurements relationshipId={id} />
          <RelationshipDocumentation relationshipId={id} clientView />
        </div>
      ) : (
        <EmptyState icon={<FolderOpen />} title="Choose a coach" description="Select a coach above to see your shared records." />
      )}
    </>
  );
}
