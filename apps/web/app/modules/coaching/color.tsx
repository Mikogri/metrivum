import { Label, Radio, RadioGroup } from "react-aria-components";
import styles from "./color.module.css";

/** Group colours: a short fixed palette that stays readable as dots, chips and calendar marks. */
export const GROUP_COLORS = [
  { value: "#8B8B8B", name: "Grey" },
  { value: "#3EE09A", name: "Green" },
  { value: "#4FD1C5", name: "Teal" },
  { value: "#79A8FF", name: "Blue" },
  { value: "#A98BFF", name: "Violet" },
  { value: "#F472B6", name: "Pink" },
  { value: "#F0605D", name: "Red" },
  { value: "#F2A93B", name: "Amber" },
];

export function ColorSwatches({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const known = GROUP_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase());
  const options = known ? GROUP_COLORS : [...GROUP_COLORS, { value, name: "Current colour" }];
  return (
    <RadioGroup className={styles.group} value={options.find((c) => c.value.toLowerCase() === value.toLowerCase())?.value ?? value} onChange={onChange} orientation="horizontal">
      <Label className={styles.label}>{label}</Label>
      <div className={styles.swatches}>
        {options.map((c) => (
          <Radio key={c.value} value={c.value} aria-label={c.name} className={styles.swatch} style={{ "--swatch": c.value } as React.CSSProperties} />
        ))}
      </div>
    </RadioGroup>
  );
}
