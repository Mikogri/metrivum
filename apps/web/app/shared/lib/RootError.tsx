import { Button, ErrorState, LinkButton } from "@portable-ui/react";
import { useLocation } from "react-router";
import { localeFromPathname } from "~/shared/i18n/locale";
import styles from "./RootError.module.css";

const copy = {
  en: {
    notFound: "This page does not exist",
    notFoundBody: "Check the address or go back to the start.",
    failed: "Something went wrong while loading this page",
    failedBody: "Reload the page. If it keeps happening, try again later.",
    home: "Go to the home page",
    reload: "Reload",
  },
  pl: {
    notFound: "Ta strona nie istnieje",
    notFoundBody: "Sprawdź adres albo wróć na start.",
    failed: "Nie udało się wczytać tej strony",
    failedBody: "Odśwież stronę. Jeśli problem się powtarza, spróbuj później.",
    home: "Przejdź na stronę główną",
    reload: "Odśwież",
  },
};

/** Last-resort error screen for route errors outside module-level boundaries. */
export function RootError({
  status,
  error,
}: {
  status: number;
  error: unknown;
}) {
  const location = useLocation();
  const locale = localeFromPathname(location.pathname);
  const t = copy[locale];
  const notFound = status === 404;
  if (import.meta.env.DEV && !notFound) console.error(error);
  return (
    <main className={styles.page}>
      <ErrorState
        title={notFound ? t.notFound : t.failed}
        description={notFound ? t.notFoundBody : t.failedBody}
        reference={notFound ? undefined : `HTTP ${status}`}
        actions={
          <>
            <LinkButton href={locale === "pl" ? "/pl" : "/"} variant="primary">
              {t.home}
            </LinkButton>
            {notFound ? null : (
              <Button
                variant="secondary"
                onPress={() => window.location.reload()}
              >
                {t.reload}
              </Button>
            )}
          </>
        }
      />
    </main>
  );
}
