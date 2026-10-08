import { useState } from "react";
import { useParams } from "react-router";
import { Option, PageHeader, Select } from "@trainflow/ui-web";
import { useCoachingQuery, type ClientRelationship, type Page } from "~/modules/coaching";
import { Failure, Loading } from "~/modules/coaching";
import { RelationshipDocumentation } from "./relationship-documentation";

export default function ClientDocuments() {
  const { relationshipId } = useParams();
  const [selected, setSelected] = useState("");
  const list = useCoachingQuery<Page<ClientRelationship>>("/api/v1/coaching/my-coaches", { pageSize: 100 }, !relationshipId);
  const id = relationshipId || selected || (list.data?.items.length === 1 ? list.data.items[0]!.id : "");
  return <><PageHeader title="Shared documents" description="Measurements, files and progress photos within each coaching relationship." />
    {!relationshipId && (list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : !list.data.items.length ? <p>A coaching relationship is required to share documentation.</p> : <Select label="Coach / relationship" selectedKey={id || null} onSelectionChange={(k) => setSelected(String(k))}>{list.data.items.map((r) => <Option key={r.id} id={r.id}>{r.coach.displayName || r.coach.username || "Coach"} · {r.status}</Option>)}</Select>)}
    {id ? <RelationshipDocumentation relationshipId={id} clientView /> : list.data?.items.length ? <p>Select a coach to view your shared records.</p> : null}
  </>;
}
