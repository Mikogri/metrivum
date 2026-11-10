import { ChevronDown } from "lucide-react";
import {
  Button,
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading,
} from "react-aria-components";
import styles from "./Faq.module.css";

export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <DisclosureGroup className={styles.group} allowsMultipleExpanded>
      {items.map((item, i) => (
        <Disclosure key={item.q} id={String(i)} className={styles.item}>
          <Heading level={3} className={styles.heading}>
            <Button slot="trigger" className={styles.trigger}>
              <span>{item.q}</span>
              <ChevronDown aria-hidden="true" className={styles.chevron} />
            </Button>
          </Heading>
          <DisclosurePanel className={styles.panel}>
            <p className={styles.answer}>{item.a}</p>
          </DisclosurePanel>
        </Disclosure>
      ))}
    </DisclosureGroup>
  );
}
