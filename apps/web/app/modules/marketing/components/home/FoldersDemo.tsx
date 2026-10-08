import { Copy, FileText, Folder, FolderOpen, LayoutTemplate } from "lucide-react";
import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./FoldersDemo.module.css";

export function FoldersDemo() {
  const m = usePublicMessages();
  const f = m.home.folders;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) {
      if (inView) setCopied(true);
      return;
    }
    const timer = setTimeout(() => setCopied(true), 1400);
    return () => clearTimeout(timer);
  }, [inView]);

  const [offSeason, hypertrophy, templates, strength] = f.tree;
  return (
    <div ref={ref} className={styles.card} data-inview={inView || undefined} data-copied={copied || undefined}>
      <ul role="list" className={styles.tree}>
        <li className={styles.folder}>
          <FolderOpen aria-hidden="true" />
          {offSeason}
          <ul role="list" className={styles.children}>
            <li className={styles.folder}>
              <Folder aria-hidden="true" />
              {hypertrophy}
            </li>
            <li className={styles.doc} data-new>
              <FileText aria-hidden="true" />
              {strength}
              <span className={styles.badge}>{f.copied}</span>
            </li>
          </ul>
        </li>
        <li className={styles.folder}>
          <FolderOpen aria-hidden="true" />
          {templates}
          <ul role="list" className={styles.children}>
            <li className={styles.template}>
              <LayoutTemplate aria-hidden="true" />
              {strength}
              <button
                type="button"
                className={styles.copy}
                onClick={() => {
                  setCopied(false);
                  requestAnimationFrame(() => requestAnimationFrame(() => setCopied(true)));
                }}
              >
                <Copy aria-hidden="true" />
                {f.copyAction}
              </button>
            </li>
          </ul>
        </li>
      </ul>
      <span className={styles.ghost} aria-hidden="true">
        <LayoutTemplate />
        {strength}
      </span>
    </div>
  );
}
