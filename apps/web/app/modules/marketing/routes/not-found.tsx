import { useLocation } from "react-router";
import { EmptyState, LinkButton } from "@trainflow/ui-web";
import { localeFromPathname } from "~/shared/i18n/locale";
import { publicPath } from "~/shared/i18n/public-routes";
import { publicMessages } from "../messages";
import type { Route } from "./+types/not-found";
import styles from "./not-found.module.css";

// Pre-rendered at /404/index.html; the host serves that file with a real 404 status for unknown public URLs.
export function meta({ location }: Route.MetaArgs) {
  const m = publicMessages(localeFromPathname(location.pathname));
  return [{ title: m.notFound.meta.title }, { name: "robots", content: "noindex" }];
}

export default function NotFound() {
  return <NotFoundView />;
}

function NotFoundView() {
  const location = useLocation();
  const locale = localeFromPathname(location.pathname);
  const m = publicMessages(locale);
  return (
    <main className={styles.page} lang={locale}>
      <img src="/brand/trainflow-logo.png" alt="TrainFlow" width={548} height={96} className={styles.logo} />
      <p className={styles.code} aria-hidden="true">
        404
      </p>
      <EmptyState
        title={<span role="heading" aria-level={1}>{m.notFound.title}</span>}
        description={m.notFound.body}
        actions={
          <LinkButton href={publicPath("home", locale)} variant="primary">
            {m.notFound.home}
          </LinkButton>
        }
      />
    </main>
  );
}
