import { ArrowLeft } from "lucide-react";
import { Link as RouterLink } from "react-router";
import { Spotlight } from "./Spotlight";
import { SplitHeading } from "./SplitHeading";
import styles from "./SubpageHero.module.css";

export function SubpageHero({ title, lead, back }: { title: string; lead: string; back?: { to: string; label: string } }) {
  return (
    <header className={styles.hero}>
      <Spotlight />
      <div className={styles.inner}>
        {back ? (
          <RouterLink to={back.to} className={styles.back}>
            <ArrowLeft aria-hidden="true" />
            {back.label}
          </RouterLink>
        ) : null}
        <SplitHeading text={title} className={styles.title} />
        <p className={styles.lead}>{lead}</p>
      </div>
    </header>
  );
}
