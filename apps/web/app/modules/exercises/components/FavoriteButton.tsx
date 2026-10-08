import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { IconButton, toast } from "@trainflow/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { useT } from "~/shared/i18n/AppLocale";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { setFavorite } from "../api";
import { exerciseKeys } from "../queries";
import styles from "./FavoriteButton.module.css";

export function FavoriteButton({ id, isFavorite, isArchived = false }: { id: string; isFavorite: boolean; isArchived?: boolean }) {
  const m = useT();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const access = useFeatureAccess("exercises.favorites");
  const showError = useErrorToast();
  const mutation = useMutation({
    mutationFn: (next: boolean) => setFavorite(api, id, next),
    onSuccess: (_, next) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.all(a) });
      toast({ tone: "success", title: next ? m.exercises.favoriteAdded : m.exercises.favoriteRemoved, duration: 2500 });
    },
    onError: (error) => showError(error),
  });
  if (!access.allowed) return null;
  // Optimistic state is avoided: the heart reflects the server after the request succeeds.
  const shown = mutation.isPending ? !isFavorite : isFavorite;
  return (
    <IconButton
      label={shown ? m.exercises.unfavorite : m.exercises.favorite}
      icon={<Heart className={shown ? styles.on : undefined} />}
      size="sm"
      isDisabled={mutation.isPending || (isArchived && !isFavorite)}
      onPress={() => mutation.mutate(!isFavorite)}
    />
  );
}
