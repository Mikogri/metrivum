import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RefreshCw,
  X,
} from "lucide-react";
import { useId } from "react";
import {
  Button,
  Combobox,
  IconButton,
  Option,
  Select,
  Switch,
} from "@portable-ui/react";
import type { BackgroundParam } from "./backgrounds/catalog";
import {
  DEFAULT_BACKDROP,
  backgrounds,
  changedProps,
  editableParams,
  hexToRgb,
  isRgb,
  resolveCover,
  rgbToHex,
  type CoverStyle,
} from "./coverStyle";
import styles from "./CoverEditor.module.css";

const HEX6 = /^#[0-9a-f]{6}$/i;
/** "noiseIntensity" → "Noise intensity". */
const label = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => " " + c.toLowerCase());

export type CoverEditorText = {
  background: string;
  previous: string;
  next: string;
  reset: string;
  restart: string;
  changed: (n: number) => string;
  addColour: string;
  removeColour: string;
  backdrop: string;
};

/**
 * Pick any React Bits background for the cover and change its settings; the cover above shows every change live.
 * Only settings that differ from the background's starting point are kept.
 */
export function CoverEditor({
  value,
  onChange,
  onRestart,
  text,
}: {
  value: CoverStyle;
  onChange: (next: CoverStyle) => void;
  onRestart: () => void;
  text: CoverEditorText;
}) {
  const { entry, props, backdrop } = resolveCover(value);
  const index = backgrounds.indexOf(entry);
  const changed = changedProps(entry, props);
  // The banner colour belongs to the cover, not to one background: it stays when the background changes or resets.
  const keep = backdrop !== DEFAULT_BACKDROP ? { backdrop } : {};
  const pick = (name: string) => onChange({ background: name, ...keep });
  const step = (delta: number) =>
    pick(
      backgrounds[(index + delta + backgrounds.length) % backgrounds.length]!
        .name,
    );
  const set = (name: string, next: unknown) =>
    onChange({
      background: entry.name,
      props: changedProps(entry, { ...props, [name]: next }),
      ...keep,
    });
  const setBackdrop = (next: string) =>
    onChange({
      background: entry.name,
      props: changed,
      ...(next !== DEFAULT_BACKDROP ? { backdrop: next } : {}),
    });
  return (
    <div className={styles.editor}>
      <div className={styles.top}>
        <IconButton
          size="sm"
          icon={<ChevronLeft />}
          label={text.previous}
          onPress={() => step(-1)}
        />
        <Combobox
          aria-label={text.background}
          className={styles.picker}
          defaultItems={backgrounds.map((item) => ({
            id: item.name,
            name: label(item.name),
          }))}
          selectedKey={entry.name}
          onSelectionChange={(key) => key && pick(String(key))}
        >
          {(item: { id: string; name: string }) => (
            <Option id={item.id}>{item.name}</Option>
          )}
        </Combobox>
        <IconButton
          size="sm"
          icon={<ChevronRight />}
          label={text.next}
          onPress={() => step(1)}
        />
        <span className={styles.count}>
          {index + 1}/{backgrounds.length}
        </span>
        <span className={styles.spacer} />
        <span className={styles.count}>
          {text.changed(Object.keys(changed).length)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          iconStart={<RefreshCw />}
          onPress={onRestart}
        >
          {text.restart}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconStart={<RotateCcw />}
          onPress={() => pick(entry.name)}
          isDisabled={!Object.keys(changed).length}
        >
          {text.reset}
        </Button>
      </div>
      <div className={styles.params}>
        <div
          className={styles.param}
          data-changed={backdrop !== DEFAULT_BACKDROP || undefined}
        >
          <label className={styles.name} htmlFor="cover-backdrop">
            {text.backdrop}
          </label>
          <span className={styles.row}>
            <input
              id="cover-backdrop"
              type="color"
              className={styles.color}
              value={backdrop}
              onChange={(e) => setBackdrop(e.target.value)}
            />
            <span className={styles.hex}>{backdrop}</span>
          </span>
        </div>
        {editableParams(entry).map((param) => (
          <Param
            key={`${entry.name}-${param.name}`}
            param={param}
            value={props[param.name]}
            changed={param.name in changed}
            onChange={(next) => set(param.name, next)}
            text={text}
          />
        ))}
      </div>
    </div>
  );
}

function Param({
  param,
  value,
  changed,
  onChange,
  text,
}: {
  param: BackgroundParam;
  value: unknown;
  changed: boolean;
  onChange: (value: unknown) => void;
  text: CoverEditorText;
}) {
  const id = useId();
  const name = label(param.name);
  if (param.kind === "boolean")
    return (
      <div className={styles.param} data-changed={changed || undefined}>
        <Switch
          isSelected={Boolean(value ?? param.default)}
          onChange={onChange}
        >
          {name}
        </Switch>
      </div>
    );
  return (
    <div className={styles.param} data-changed={changed || undefined}>
      <label className={styles.name} htmlFor={id} title={param.name}>
        {name}
      </label>
      <Control
        id={id}
        name={name}
        param={param}
        value={value}
        onChange={onChange}
        text={text}
      />
    </div>
  );
}

function Control({
  id,
  name,
  param,
  value,
  onChange,
  text,
}: {
  id: string;
  name: string;
  param: BackgroundParam;
  value: unknown;
  onChange: (value: unknown) => void;
  text: CoverEditorText;
}) {
  if (isRgb(param)) {
    const rgb = Array.isArray(value)
      ? (value as number[])
      : (param.default as number[]);
    const hex = rgbToHex(rgb);
    return (
      <span className={styles.row}>
        <input
          id={id}
          type="color"
          className={styles.color}
          value={hex}
          onChange={(e) => onChange(hexToRgb(e.target.value))}
        />
        <span className={styles.hex}>{hex}</span>
      </span>
    );
  }
  switch (param.kind) {
    case "number": {
      const n = typeof value === "number" ? value : Number(param.default ?? 0);
      const min = Math.min(param.min ?? 0, n);
      const max = Math.max(param.max ?? 10, n);
      return (
        <span className={styles.row}>
          <input
            id={id}
            type="range"
            className={styles.range}
            min={min}
            max={max}
            step={param.step ?? 0.01}
            value={n}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <input
            type="number"
            className={styles.number}
            aria-label={name}
            min={min}
            max={max}
            step={param.step ?? 0.01}
            value={n}
            onChange={(e) =>
              e.target.value !== "" && onChange(Number(e.target.value))
            }
          />
        </span>
      );
    }
    case "color": {
      const color =
        typeof value === "string"
          ? value
          : typeof param.default === "string"
            ? param.default
            : "#ffffff";
      return (
        <span className={styles.row}>
          <input
            id={id}
            type="color"
            className={styles.color}
            value={HEX6.test(color) ? color : "#ffffff"}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className={styles.hex}>{color}</span>
        </span>
      );
    }
    case "colors": {
      const list = Array.isArray(value)
        ? (value as string[])
        : Array.isArray(param.default)
          ? (param.default as string[])
          : [];
      return (
        <span className={styles.row}>
          {list.map((color, index) => (
            <span key={index} className={styles.swatch}>
              <input
                id={index === 0 ? id : undefined}
                type="color"
                className={styles.color}
                aria-label={`${name} ${index + 1}`}
                value={HEX6.test(color) ? color : "#ffffff"}
                onChange={(e) =>
                  onChange(
                    list.map((c, i) => (i === index ? e.target.value : c)),
                  )
                }
              />
              {list.length > 1 ? (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={text.removeColour}
                  onClick={() => onChange(list.filter((_, i) => i !== index))}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </span>
          ))}
          {list.length < 8 ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() =>
                onChange([...list, list[list.length - 1] ?? "#ffffff"])
              }
            >
              {text.addColour}
            </Button>
          ) : null}
        </span>
      );
    }
    case "select":
      return (
        <Select
          aria-label={name}
          selectedKey={String(value ?? param.default ?? "")}
          onSelectionChange={(key) => key !== null && onChange(String(key))}
        >
          {(param.options ?? []).map((option) => (
            <Option key={option} id={option}>
              {label(option)}
            </Option>
          ))}
        </Select>
      );
    case "multi": {
      const list = Array.isArray(value)
        ? (value as string[])
        : Array.isArray(param.default)
          ? (param.default as string[])
          : [];
      return (
        <span className={styles.row}>
          {param.options?.map((option) => (
            <label key={option} className={styles.check}>
              <input
                type="checkbox"
                checked={list.includes(option)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...list, option]
                      : list.filter((x) => x !== option),
                  )
                }
              />
              {label(option)}
            </label>
          ))}
        </span>
      );
    }
    case "vector": {
      const list = Array.isArray(value)
        ? (value as number[])
        : Array.isArray(param.default)
          ? (param.default as number[])
          : [0, 0];
      return (
        <span className={styles.row}>
          {list.map((n, index) => (
            <input
              key={index}
              id={index === 0 ? id : undefined}
              type="number"
              className={styles.number}
              aria-label={`${name} ${index + 1}`}
              step={0.05}
              value={n}
              onChange={(e) =>
                onChange(
                  list.map((x, i) =>
                    i === index ? Number(e.target.value) : x,
                  ),
                )
              }
            />
          ))}
        </span>
      );
    }
    default:
      return null;
  }
}
