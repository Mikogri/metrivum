import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link as RouterLink } from "react-router";
import styles from "./AuthHeader.module.css";

/** `back` adds an arrow before the title that leaves the form (for example back to the app when adding an account). */
export function AuthHeader({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        {back ? (
          <RouterLink
            to={back.to}
            className={styles.back}
            aria-label={back.label}
            title={back.label}
          >
            <ArrowLeft aria-hidden="true" />
          </RouterLink>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className={styles.footer}>{children}</p>;
}

/** An error about the whole form (network, rate limit): one small red line, like the errors under the fields. */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.formError} role="alert">
      {children}
    </p>
  );
}
