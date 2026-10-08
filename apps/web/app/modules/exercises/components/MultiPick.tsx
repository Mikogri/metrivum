import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Combobox, Option } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./MultiPick.module.css";

interface Choice {
  id: string;
  label: string;
}

/** Combobox that adds chips; used for tags, muscles and movement patterns. */
export function MultiPick({
  label,
  options,
  selected,
  onChange,
  onCreate,
  createLabel,
}: {
  label: string;
  options: Choice[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreate?: (value: string) => void;
  createLabel?: (value: string) => string;
}) {
  const m = useT();
  const [input, setInput] = useState("");
  const available = options.filter((option) => !selected.includes(option.id));
  const typed = input.trim();
  const canCreate = Boolean(onCreate && typed && !options.some((option) => option.label.toLowerCase() === typed.toLowerCase()));
  const items = [...available.filter((option) => option.label.toLowerCase().includes(typed.toLowerCase()))];
  const all = canCreate ? [...items, { id: `__create:${typed}`, label: createLabel ? createLabel(typed) : typed }] : items;

  return (
    <div className={styles.wrap}>
      <Combobox placeholder={m.common.ph.search}
        label={label}
        items={all}
        inputValue={input}
        onInputChange={setInput}
        selectedKey={null}
        allowsCustomValue
        onSelectionChange={(key) => {
          if (key === null) return;
          const id = String(key);
          if (id.startsWith("__create:")) onCreate?.(id.slice(9));
          else onChange([...selected, id]);
          setInput("");
        }}
      >
        {(item: Choice) => (
          <Option id={item.id} textValue={item.label}>
            {item.id.startsWith("__create:") ? (
              <span className={styles.create}>
                <Plus aria-hidden="true" /> {item.label}
              </span>
            ) : (
              item.label
            )}
          </Option>
        )}
      </Combobox>
      {selected.length ? (
        <ul className={styles.chips} aria-label={label}>
          {selected.map((id) => {
            const option = options.find((o) => o.id === id);
            const name = option?.label ?? id;
            return (
              <li key={id} className={styles.chip}>
                {name}
                <AriaButton className={styles.remove} aria-label={`${name} ×`} onPress={() => onChange(selected.filter((s) => s !== id))}>
                  <X aria-hidden="true" />
                </AriaButton>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
