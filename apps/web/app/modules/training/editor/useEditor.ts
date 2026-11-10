import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanDto, TrainingDocument } from "@metrivum/api-client-web";
import { ApiError, NetworkError, isAbortError } from "~/shared/http/errors";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { saveDraft } from "../api";
import { trainingKeys } from "../queries";
import {
  commit,
  createHistory,
  redo as redoHistory,
  undo as undoHistory,
  type History,
} from "./model/history";

export interface EditorMeta {
  name: string;
  description: string;
  folderId: string | null;
}

export type SaveStatus =
  "clean" | "dirty" | "saving" | "saved" | "error" | "conflict" | "offline";

const AUTOSAVE_DELAY = 2500;

function serialize(doc: TrainingDocument, meta: EditorMeta) {
  return JSON.stringify({ meta, doc });
}

/**
 * Editor working copy. The draft lives here, separate from the query cache, so background
 * refetches never overwrite unsaved edits. Saves are single-flight and carry the version
 * they started from; a newer server version produces a conflict instead of an overwrite.
 */
export function useEditor(
  plan: PlanDto,
  initialVersion: number,
  options: { readOnly: boolean },
) {
  const api = useApi();
  const accountKey = useAccountKey();
  const queryClient = useQueryClient();

  const [history, setHistory] = useState<History>(() =>
    createHistory(plan.document),
  );
  const [meta, setMeta] = useState<EditorMeta>({
    name: plan.name,
    description: plan.description,
    folderId: plan.folderId,
  });
  const [status, setStatus] = useState<SaveStatus>("clean");
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(initialVersion);

  const historyRef = useRef(history);
  const metaRef = useRef(meta);
  const versionRef = useRef(initialVersion);
  const [savedBody, setSavedBody] = useState(() =>
    serialize(plan.document, {
      name: plan.name,
      description: plan.description,
      folderId: plan.folderId,
    }),
  );
  const savedRef = useRef(savedBody);
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const statusRef = useRef<SaveStatus>("clean");
  historyRef.current = history;
  metaRef.current = meta;

  const setStatusBoth = (next: SaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const body = useMemo(
    () => serialize(history.present, meta),
    [history.present, meta],
  );
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const dirty = body !== savedBody;
  const isDirty = useCallback(
    () => bodyRef.current !== savedRef.current || inFlight.current !== null,
    [],
  );

  useEffect(() => {
    if (statusRef.current === "conflict" || statusRef.current === "saving")
      return;
    if (
      dirty &&
      statusRef.current !== "error" &&
      statusRef.current !== "offline"
    )
      setStatusBoth("dirty");
    if (
      !dirty &&
      (statusRef.current === "dirty" || statusRef.current === "error")
    )
      setStatusBoth("clean");
  }, [dirty]);

  const save = useCallback(async (): Promise<void> => {
    if (options.readOnly || statusRef.current === "conflict") return;
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    // One shared promise covers the whole queue, including edits requested during a save.
    const run = (async () => {
      do {
        again.current = false;
        const doc = historyRef.current.present;
        const snapshotMeta = metaRef.current;
        const body = bodyRef.current;
        if (body === savedRef.current) {
          setStatusBoth("clean");
          return;
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatusBoth("offline");
          return;
        }
        setStatusBoth("saving");
        setError(null);
        try {
          const result = await saveDraft(
            api,
            plan.id,
            {
              name: snapshotMeta.name.trim() || plan.name,
              description: snapshotMeta.description,
              folderId: snapshotMeta.folderId,
              document: doc,
            },
            versionRef.current,
          );
          versionRef.current = result.version;
          setVersion(result.version);
          // The saved snapshot is what we sent; edits made during the request stay dirty.
          savedRef.current = body;
          setSavedBody(body);
          queryClient.setQueryData(
            trainingKeys.plan(accountKey, plan.id),
            result,
          );
          void queryClient.invalidateQueries({
            queryKey: trainingKeys.plans(accountKey),
            refetchType: "none",
          });
          const stillDirty = bodyRef.current !== savedRef.current;
          setStatusBoth(stillDirty ? "dirty" : "saved");
        } catch (caught) {
          if (isAbortError(caught)) {
            setStatusBoth("dirty");
            return;
          }
          setError(caught);
          if (caught instanceof ApiError && caught.status === 412)
            setStatusBoth("conflict");
          else if (caught instanceof NetworkError) setStatusBoth("offline");
          else setStatusBoth("error");
          return;
        }
      } while (again.current);
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [api, accountKey, options.readOnly, plan.id, plan.name, queryClient]);

  // Debounced autosave: waits for a pause in editing; never overlaps with a running save.
  useEffect(() => {
    if (options.readOnly || !dirty) return;
    if (status === "conflict" || status === "error" || status === "offline")
      return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [history.present, meta, dirty, status, save, options.readOnly]);

  // Coming back online retries a save that stopped because the connection dropped.
  useEffect(() => {
    const onOnline = () => {
      if (statusRef.current === "offline") {
        setStatusBoth("dirty");
        void save();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [save]);

  const apply = useCallback(
    (fn: (doc: TrainingDocument) => TrainingDocument) => {
      if (options.readOnly) return;
      setHistory((h) => commit(h, fn(h.present)));
      if (statusRef.current === "error") setStatusBoth("dirty");
    },
    [options.readOnly],
  );

  const undo = useCallback(() => setHistory((h) => undoHistory(h)), []);
  const redo = useCallback(() => setHistory((h) => redoHistory(h)), []);

  const updateMeta = useCallback(
    (patch: Partial<EditorMeta>) => {
      if (options.readOnly) return;
      setMeta((current) => ({ ...current, ...patch }));
    },
    [options.readOnly],
  );

  /** After a conflict: drop local edits and start again from the server's latest draft. */
  const reset = useCallback((next: PlanDto, nextVersion: number) => {
    const nextMeta = {
      name: next.name,
      description: next.description,
      folderId: next.folderId,
    };
    savedRef.current = serialize(next.document, nextMeta);
    setSavedBody(savedRef.current);
    versionRef.current = nextVersion;
    setVersion(nextVersion);
    setHistory(createHistory(next.document));
    setMeta(nextMeta);
    setError(null);
    setStatusBoth("clean");
  }, []);

  return {
    doc: history.present,
    meta,
    version,
    status,
    error,
    dirty,
    isDirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    apply,
    undo,
    redo,
    updateMeta,
    save,
    reset,
  };
}

export type EditorApi = ReturnType<typeof useEditor>;
