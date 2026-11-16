import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FolderDto } from "@metrivum/api-client-web";
import { toast } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getPlan, saveDraft, updateFolder } from "../api";
import { trainingKeys } from "../queries";

/** What is being dragged in the library: a plan (by id) or a folder (with what a move needs). */
export type DragItem =
  | { kind: "plan"; id: string; name: string }
  | { kind: "folder"; folder: FolderDto };

const itemId = (item: DragItem) =>
  item.kind === "plan" ? item.id : item.folder.id;

/**
 * Drag and drop in the library: plans and folders can be dropped onto a folder (or onto the
 * "parent folder" strip) to move them there. Uses the same requests as the Move dialogs.
 */
export function useDragToFolder(enabled: boolean) {
  const m = useT();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = useMutation({
    mutationFn: async ({
      item,
      folderId,
    }: {
      item: DragItem;
      folderId: string | null;
    }) => {
      if (item.kind === "folder") {
        const f = item.folder;
        return updateFolder(
          api,
          f.id,
          { name: f.name, parentId: folderId, position: f.position },
          f.version,
        );
      }
      const current = await getPlan(api, item.id);
      return saveDraft(
        api,
        item.id,
        {
          name: current.data.name,
          description: current.data.description,
          folderId,
          document: current.data.document,
        },
        current.version,
      );
    },
    onSuccess: (_, { item }) => {
      void queryClient.invalidateQueries({
        queryKey:
          item.kind === "folder"
            ? trainingKeys.folders(a)
            : trainingKeys.plans(a),
      });
      toast({
        tone: "success",
        title:
          item.kind === "folder"
            ? m.training.library.folder.moved
            : m.training.library.moveDialog.moved,
      });
    },
    onError: (error) => showError(error),
  });

  /** Whether the dragged item may go into this folder (never into itself or where it already is). */
  const accepts = (folderId: string | null, currentParent?: string | null) => {
    if (!dragging) return false;
    if (
      dragging.kind === "folder" &&
      (dragging.folder.id === folderId || dragging.folder.parentId === folderId)
    )
      return false;
    return currentParent === undefined || currentParent !== folderId;
  };

  /** Props for something that can be dragged. */
  const source = (item: DragItem) =>
    enabled
      ? {
          draggable: true,
          "data-drag-source": true,
          "data-dragging":
            (dragging && itemId(dragging) === itemId(item)) || undefined,
          onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "text/plain",
              item.kind === "plan" ? item.name : item.folder.name,
            );
            setDragging(item);
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
        }
      : {};

  /** Props for a folder (or the parent strip, `key` "parent") that takes drops. */
  const target = (
    folderId: string | null,
    key: string,
    currentParent?: string | null,
  ) => ({
    "data-drop-over": over === key || undefined,
    onDragOver: (event: React.DragEvent) => {
      if (!accepts(folderId, currentParent)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node))
        setOver((o) => (o === key ? null : o));
    },
    onDrop: (event: React.DragEvent) => {
      if (!dragging || !accepts(folderId, currentParent)) return;
      event.preventDefault();
      move.mutate({ item: dragging, folderId });
      setDragging(null);
      setOver(null);
    },
  });

  /** Moves an item without dragging (e.g. "Move up" in a menu). */
  const moveTo = (item: DragItem, folderId: string | null) =>
    move.mutate({ item, folderId });

  return { dragging, source, target, moveTo, moving: move.isPending };
}
