import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Skeleton,
  TextField,
  toast,
} from "@portable-ui/react";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import {
  useAccountContext,
  useAccountKey,
  useApi,
} from "~/shared/session/AccountScope";
import { useSessionManager } from "~/shared/session/SessionProvider";
import styles from "./settings.module.css";

type ErasurePreview = {
  userId: string;
  tables: { table: string; rows: number }[];
  rows: number;
  files: number;
};

const PATH = "/api/v1/dev/account-erasure";

/**
 * Development only: deletes the signed-in account with everything tied to it. The API offers it only in Development
 * with the owner database connection; anywhere else the preview answers 404 and this card stays hidden.
 */
export function DevAccountErasure() {
  const m = useT();
  const t = m.settings.devErase;
  const api = useApi();
  const accountKey = useAccountKey();
  const { account } = useAccountContext();
  const manager = useSessionManager();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const preview = useQuery({
    queryKey: [accountKey, "dev-account-erasure"],
    queryFn: async ({ signal }) =>
      (await api<ErasurePreview>({ path: PATH, signal })).data,
    retry: false,
    staleTime: 0,
  });
  const erase = useMutation({
    mutationFn: async () =>
      (
        await api<ErasurePreview>({
          method: "POST",
          path: PATH,
          json: { email: typed.trim() },
        })
      ).data,
    onSuccess: async () => {
      setOpen(false);
      toast({ tone: "neutral", title: t.done(account.email ?? "") });
      await manager.signOut(account.slot).catch(() => undefined);
      const next = manager.getState();
      navigate(next.activeSlot !== null ? "/app" : "/auth/login", {
        replace: true,
      });
    },
  });

  // Shown only once the API confirms it offers this (Development with the owner connection); never flashes in first.
  if (!preview.data && !open) return null;

  const email = account.email ?? "";
  const matches =
    typed.trim().toLowerCase() === email.trim().toLowerCase() &&
    email.length > 0;
  const data = preview.data;

  return (
    <Card
      as="section"
      padding="lg"
      aria-labelledby="dev-erase-title"
      className={styles.danger}
    >
      <div className={styles.dangerHead}>
        <div>
          <h2 id="dev-erase-title" className={styles.title}>
            {t.title}
          </h2>
          <p className={styles.hint}>{t.body}</p>
        </div>
        <Button
          variant="danger"
          iconStart={<Trash2 />}
          onPress={() => {
            setTyped("");
            erase.reset();
            void preview.refetch();
            setOpen(true);
          }}
        >
          {t.open}
        </Button>
      </div>
      <Dialog
        isOpen={open}
        onOpenChange={(next) => {
          if (!erase.isPending) setOpen(next);
        }}
        title={t.dialogTitle}
        size="md"
        footer={(close) => (
          <>
            <Button
              variant="secondary"
              onPress={close}
              isDisabled={erase.isPending}
              autoFocus
            >
              {m.common.cancel}
            </Button>
            <Button
              variant="danger"
              iconStart={<Trash2 />}
              loading={erase.isPending}
              isDisabled={!matches || !data}
              onPress={() => erase.mutate()}
            >
              {t.confirm}
            </Button>
          </>
        )}
      >
        <div className={styles.eraseBody}>
          <p>{t.dialogBody(email)}</p>
          {preview.isFetching && !data ? (
            <Skeleton height="6rem" />
          ) : data ? (
            <div className={styles.eraseSummary}>
              <p>
                <strong>
                  {t.summary(data.rows, data.tables.length, data.files)}
                </strong>
              </p>
              {data.tables.length ? (
                <ul className={styles.eraseTables}>
                  {data.tables.map((row) => (
                    <li key={row.table}>
                      <code>{row.table}</code>
                      <span>{row.rows}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {erase.error ? (
            <Alert
              tone="danger"
              title={
                erase.error instanceof ApiError && erase.error.problem?.detail
                  ? erase.error.problem.detail
                  : errorText(m, erase.error)
              }
            />
          ) : null}
          <TextField
            label={t.typeEmail(email)}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
            placeholder={email}
            isDisabled={erase.isPending}
          />
        </div>
      </Dialog>
    </Card>
  );
}
