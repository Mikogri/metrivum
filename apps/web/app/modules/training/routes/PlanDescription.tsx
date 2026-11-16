import { useState } from "react";
import { ContextMenu } from "@portable-ui/react";
import styles from "./program-detail.module.css";

export function PlanDescription({
  text,
  title,
}: {
  text: string;
  title: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.descriptionPreview}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ x: box.left, y: box.bottom });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {text}
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={title}
          items={[]}
          onAction={() => {}}
          onClose={() => setMenu(null)}
        >
          <p className={styles.fullDescription}>{text}</p>
        </ContextMenu>
      )}
    </>
  );
}
