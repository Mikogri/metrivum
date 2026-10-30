import { ResourceError } from "~/shared/lib/ResourceError";
import { EyeOff } from "lucide-react";
import styles from "./coaching.module.css";
import { useEffect, useState, type ReactNode } from "react";
import { useBlocker } from "react-router";
import { Alert, AlertDialog, Badge, Button, LinkButton, LoadingState, Pagination } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http";
import { useCoachingQuery, type Page } from "./api";
import { useT } from "~/shared/i18n/AppLocale";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { errorText } from "~/shared/lib/errorText";

export function StatusBadge({ status, size }: { status: string; size?: "sm" | "md" }) {
  // Not published yet (forms, offers, plans): clients can't see it, so it has to stand out.
  if (status === "Draft") return <NotPublishedBadge size={size} />;
  return <Badge dot size={size} tone={["Active", "Accepted", "Reviewed", "Paid"].includes(status) ? "success" : ["Suspended", "Overdue", "AwaitingPayment"].includes(status) ? "warning" : "neutral"}>{status.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`)}</Badge>;
}

/** Something clients can't see yet because it was never published: a warning-coloured badge that stands out. */
export function NotPublishedBadge({ size, label = "Not published" }: { size?: "sm" | "md"; label?: string }) {
  return <Badge size={size} tone="warning" icon={<EyeOff />} className={styles.notPublished}>{label}</Badge>;
}

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <ResourceError error={error} retry={retry} />;
}

export function MutationError({ error }: { error: unknown }) {
  const m = useT();
  const [reload, setReload] = useState(false);
  const message = error ? error instanceof ApiError && error.status < 500 ? error.message : errorText(m, error) : null;
  const showError = useErrorToast();
  // A validation problem (400) is shown in the form, next to what needs fixing, not as a toast.
  const validation = error instanceof ApiError && error.status === 400;
  useEffect(() => { if (error && message && !validation) showError(error, message); }, [error, message, showError, validation]);
  if (!error) return null;
  const conflict = error instanceof ApiError && (error.status === 412 || error.status === 409 && error.code === "VERSION_CONFLICT");
  return <><Alert tone="danger" title={error instanceof ApiError && error.status < 500 ? error.message : errorText(m, error)} live="assertive" actions={conflict && <Button onPress={() => setReload(true)}>Reload latest version</Button>} />
    <AlertDialog isOpen={reload} onOpenChange={setReload} title="Reload the latest version?" tone="danger" confirmLabel="Discard changes and reload" cancelLabel="Keep editing" onConfirm={() => window.location.reload()}>Your unsaved changes on this page will be discarded. Copy any text you want to keep before reloading.</AlertDialog></>;
}

export function Loading() { return <LoadingState label="Loading" />; }

// Refresh clean editors after another tab/worker writes, while preserving unsaved local edits.
export function EditableResource<T extends { id: string; version: number }>({ value, children }: { value: T; children: (snapshot: T, onDirtyChange: (dirty: boolean) => void) => ReactNode }) {
  const [snapshot, setSnapshot] = useState(value);
  const [dirty, setDirty] = useState(false);
  if (value.id !== snapshot.id) { setSnapshot(value); setDirty(false); }
  else if (!dirty && value.version !== snapshot.version) setSnapshot(value);
  return children(snapshot, setDirty);
}

export function DraftNavigationGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  return <AlertDialog isOpen={blocker.state === "blocked"} onOpenChange={(open) => { if (!open && blocker.state === "blocked") blocker.reset(); }} title="Discard unsaved changes?" tone="danger" confirmLabel="Discard changes" cancelLabel="Keep editing" onConfirm={() => { if (blocker.state === "blocked") blocker.proceed(); }}>Your changes on this page have not been saved yet. If you leave now, they are lost and cannot be recovered.</AlertDialog>;
}

export function ListPagination({ data, onChange }: { data: Page<unknown>; onChange: (page: number) => void }) {
  return <Pagination page={data.page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} onPageChange={onChange} pageSize={data.pageSize}
    labels={{ previous: "Previous", next: "Next", status: (p, n) => `Page ${p} of ${n}`, navigation: "Pagination", pageSize: (n) => `${n} rows per page` }} />;
}

/**
 * In place of an empty offer picker: says why nothing can be chosen and what to do next.
 * Invitations and application forms always carry an offer (its terms and price), so without an
 * active one the coach needs to create, publish or reactivate one first.
 */
export function NoActiveOffers({ purpose }: { purpose: "invitation" | "form" }) {
  const all = useCoachingQuery<Page<{ id: string; status: string }>>("/api/v1/offers", { pageSize: 50 });
  const items = all.data?.items ?? [];
  const drafts = items.filter((o) => o.status === "Draft").length;
  const inactive = items.filter((o) => o.status === "Inactive").length;
  const why = purpose === "invitation" ? "An invitation always includes one of your active offers: its terms and price." : "An application form is sent with one of your active offers, so the client knows what they apply for.";
  const [title, next] = !all.data
    ? ["No active offers", "Activate an offer to continue."]
    : drafts + inactive === 0
      ? ["You have no offers yet", "Create an offer, connect an application form and publish it."]
      : drafts && !inactive
        ? [`${drafts === 1 ? "Your offer is" : `${drafts} offers are`} still a draft`, "Publish one to make it active."]
        : [`${inactive + drafts} ${inactive + drafts === 1 ? "offer is" : "offers are"} not active`, inactive ? "Reactivate an inactive offer or publish a draft." : "Publish a draft offer."];
  return (
    <Alert tone="info" title={title} actions={<LinkButton href={drafts + inactive === 0 && all.data ? "/app/offers?create=1" : "/app/offers"} size="sm">{drafts + inactive === 0 && all.data ? "Create offer" : "Open offers"}</LinkButton>}>
      {why} {next}
    </Alert>
  );
}
