import { useState } from "react";
import { Dialog } from "@metrivum/ui-web";
import type { AnatomyMessages } from "./messages";
import styles from "./anatomy.module.css";

export function AnatomyLicenses({ attribution, messages: m }: { attribution: string; messages: AnatomyMessages }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.viewerLicense} onClick={() => setOpen(true)}>Anatomy Data &amp; Licenses</button>
    <Dialog title="Anatomy Data & Licenses" isOpen={open} onOpenChange={setOpen} size="md">
      <div className={styles.license}>
        <p>{attribution}</p><p>{m.version}</p><p>{m.conversion}</p>
        <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">{m.source}</a>
        <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">{m.license}</a>
        <a href="https://creativecommons.org/licenses/by/4.0/legalcode.en" target="_blank" rel="noreferrer">{m.cc}</a>
        <p>{m.attributionNote}</p>
      </div>
    </Dialog>
  </>;
}
