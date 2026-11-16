import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useParams } from "react-router";
import { Button, ErrorState, Skeleton } from "@portable-ui/react";
import { RequireFeature } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getPlan } from "../api";
import { EditorWorkspace } from "../editor/EditorWorkspace";
import { trainingKeys } from "../queries";
import styles from "./program-editor.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Editor — Metrivum");

/** Read by AppShell: the editor takes the whole content area instead of the padded page column. */
export const handle = { workspace: true };

function Editor() {
  const params = useParams();
  const location = useLocation();
  const planId = params.programId ?? params.templateId ?? "";
  const m = useT();
  const api = useApi();
  const a = useAccountKey();
  // Loaded fresh when the editor opens; never refetched in the background over local edits.
  const query = useQuery({
    queryKey: trainingKeys.plan(a, planId),
    queryFn: ({ signal }) => getPlan(api, planId, signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  if (query.isPending) {
    return (
      <div className={styles.loading} aria-busy="true">
        <span className="tf-visually-hidden">{m.editor.loading}</span>
        <Skeleton height="3.25rem" radius="sm" />
        <div className={styles.loadingColumns}>
          <Skeleton height="100%" />
          <Skeleton height="100%" />
          <Skeleton height="100%" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    // Missing or not this account's: the same "not found", with nothing of the plan shown.
    const notFound =
      query.error instanceof ApiError &&
      (query.error.status === 404 || query.error.status === 403);
    return (
      <div className={styles.center}>
        <ErrorState
          title={
            notFound ? m.training.detail.notFound : errorText(m, query.error)
          }
          reference={traceIdOf(query.error)}
          actions={
            notFound ? undefined : (
              <Button onPress={() => void query.refetch()}>
                {m.common.retry}
              </Button>
            )
          }
        />
      </div>
    );
  }
  const plan = query.data.data;
  // Keep URLs truthful: templates live under /app/templates, programs under /app/programs.
  const expected =
    plan.kind === "Template"
      ? `/app/templates/${plan.id}/edit`
      : `/app/programs/${plan.id}/edit`;
  if (location.pathname !== expected) return <Navigate to={expected} replace />;
  return (
    <EditorWorkspace key={plan.id} plan={plan} version={query.data.version} />
  );
}

export default function ProgramEditorRoute() {
  return (
    <RequireFeature feature="training.programs.read">
      <Editor />
    </RequireFeature>
  );
}
