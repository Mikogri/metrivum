import { Camera, Trash2 } from "lucide-react";
import { AVATAR_TYPES, useAvatarActions } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import styles from "./AvatarControls.module.css";

/** On the own profile while editing: round buttons on the avatar to change or remove the photo. Saved at once, like the cover photo. */
export function AvatarControls({ hasAvatar }: { hasAvatar: boolean }) {
  const m = useT();
  const t = m.profile.photo;
  const { upload, remove } = useAvatarActions(t.invalid, t.failed);
  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;
  const changeLabel = upload.isPending ? t.uploading : hasAvatar ? t.change : t.add;
  return (
    <>
      <label className={styles.button} data-place="change" data-busy={busy || undefined} title={changeLabel}>
        <input
          type="file"
          accept={AVATAR_TYPES}
          aria-label={changeLabel}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              remove.reset();
              upload.mutate(file);
            }
          }}
        />
        <Camera aria-hidden="true" />
      </label>
      {hasAvatar ? (
        <button
          type="button"
          className={styles.button}
          data-place="remove"
          aria-label={t.remove}
          title={t.remove}
          disabled={busy}
          onClick={() => {
            upload.reset();
            remove.mutate();
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      ) : null}
      {error ? (
        <span className={styles.error} role="alert">
          {error instanceof Error && (error.message === t.invalid || error.message === t.failed) ? error.message : errorText(m, error)}
        </span>
      ) : null}
    </>
  );
}
