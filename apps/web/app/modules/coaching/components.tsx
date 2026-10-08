import { useState, type ReactNode } from "react";
import { useBlocker } from "react-router";
import { Alert, AlertDialog, Badge, Button, ErrorState, LoadingState, Pagination } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http";
import type { Page } from "./api";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";

export function StatusBadge({ status }: { status: string }) {
  return <Badge dot tone={["Active", "Accepted", "Reviewed", "Paid"].includes(status) ? "success" : ["Suspended", "Overdue", "AwaitingPayment"].includes(status) ? "warning" : "neutral"}>{status}</Badge>;
}

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  const m = useT();
  const message = error instanceof ApiError && error.status < 500 && error.status !== 412 ? error.message : errorText(m, error);
  return <ErrorState title={message} reference={traceIdOf(error)} actions={retry && <Button onPress={retry}>Reload</Button>} />;
}

export function MutationError({ error }: { error: unknown }) {
  const m = useT();
  const [reload, setReload] = useState(false);
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
