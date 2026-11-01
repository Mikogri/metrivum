import { Check, Lock, Rocket, Sparkles, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, LinkButton } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./LockedArea.module.css";

/** A link in the look of the app bar's Upgrade button: violet, a slowly drifting gradient and a faint shine. */
export function UpgradeLink({ href, children, size = "md", icon = <Rocket /> }: { href: string; children: ReactNode; size?: "sm" | "md" | "lg"; icon?: ReactNode }) {
  return <LinkButton href={href} variant="primary" size={size} className={styles.upgrade} iconStart={icon}>{children}</LinkButton>;
}

/**
 * A banner for what a higher plan adds, in the look of the app bar's Upgrade button: a slowly drifting violet
 * gradient with a faint shine, an icon, a short pitch and one action.
 */
export function UpgradeBanner({ title, body, href = "/app/checkout?plan=Pro", action }: { title: string; body: ReactNode; href?: string; action: string }) {
  return (
    <section className={styles.banner} aria-label={title}>
      <span className={styles.bannerIcon} aria-hidden="true"><Sparkles /></span>
      <div className={styles.bannerText}>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <LinkButton href={href} size="sm" className={styles.bannerAction} iconStart={<Rocket />}>{action}</LinkButton>
    </section>
  );
}

/**
 * Something the plan does not include: the content stays in place but blurred and out of reach, with a notice on top
 * that leads to the upgrade. `page` covers a whole screen, `section` one block of it. The app menu and app bar are
 * never covered.
 */
export function LockedArea({ locked, title, body, points, note, onClose, closeLabel, secondary, variant = "section", children }: {
  locked: boolean;
  title: string;
  body: string;
  points?: readonly string[];
  note?: string;
  onClose?: () => void;
  closeLabel?: string;
  /** A second, quieter action under the upgrade button. */
  secondary?: ReactNode;
  variant?: "page" | "section";
  children: ReactNode;
}) {
  const m = useT();
  // A locked page fills exactly the visible part of the screen below it, so the notice sits in the middle of the view.
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!locked || variant !== "page") return;
    const fit = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(320, window.innerHeight - top - 16));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [locked, variant]);
  if (!locked) return <>{children}</>;
  return (
    <div ref={ref} className={styles.area} data-variant={variant} style={variant === "page" && height ? { height } : undefined}>
      <div className={styles.content} inert aria-hidden="true">{children}</div>
      <div className={styles.overlay} role="dialog" aria-modal={variant === "page" || undefined} aria-label={title}>
        <div className={styles.card}>
          <div className={styles.head}>
            {onClose ? <IconButton className={styles.close} label={closeLabel ?? m.common.close} icon={<X />} variant="ghost" size="sm" onPress={onClose} /> : null}
            <span className={styles.badge}><Sparkles aria-hidden="true" />Pro</span>
            <span className={styles.icon} aria-hidden="true"><Lock /></span>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.body}>{body}</p>
          </div>
          {points?.length ? (
            <ul className={styles.points}>
              {points.map((point) => <li key={point}><span className={styles.check} aria-hidden="true"><Check /></span>{point}</li>)}
            </ul>
          ) : null}
          <div className={styles.actions}>
            <UpgradeLink href="/app/checkout?plan=Pro" size="lg">{m.access.upgradeToPro}</UpgradeLink>
            {secondary}
            {note ? <p className={styles.note}>{note}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
