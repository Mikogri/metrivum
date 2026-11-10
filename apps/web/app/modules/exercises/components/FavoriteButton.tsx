import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { IconButton, toast } from "@metrivum/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { useT } from "~/shared/i18n/AppLocale";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { setFavorite } from "../api";
import { exerciseKeys } from "../queries";
import styles from "./FavoriteButton.module.css";

export function FavoriteButton({
  id,
  isFavorite,
  isArchived = false,
}: {
  id: string;
  isFavorite: boolean;
  isArchived?: boolean;
}) {
  const m = useT();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const access = useFeatureAccess("exercises.favorites");
  const showError = useErrorToast();
  // The value the user asked for, held until the refetched list agrees. Without it the heart flipped back
  // between the request finishing and the list refreshing, then on again (a double beat).
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (wanted !== null && wanted === isFavorite) setWanted(null);
  }, [wanted, isFavorite]);
  const mutation = useMutation({
    mutationFn: (next: boolean) => setFavorite(api, id, next),
    onSuccess: (_, next) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.all(a) });
      toast({
        tone: "success",
        title: next ? m.exercises.favoriteAdded : m.exercises.favoriteRemoved,
        duration: 2500,
      });
    },
    onError: (error) => {
      setWanted(null);
      showError(error);
    },
  });
  if (!access.allowed) return null;
  const shown = wanted ?? isFavorite;
  return (
    <IconButton
      label={shown ? m.exercises.unfavorite : m.exercises.favorite}
      icon={
        <Heart
          key={beat}
          className={shown ? styles.on : undefined}
          data-beat={beat > 0 && shown ? "" : undefined}
        />
      }
      size="sm"
      className={shown ? styles.active : undefined}
      isDisabled={isArchived && !shown}
      onPress={() => {
        if (mutation.isPending) return;
        const next = !shown;
        setWanted(next);
        if (next) setBeat((value) => value + 1);
        mutation.mutate(next);
      }}
    />
  );
}
