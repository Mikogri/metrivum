import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useMemo, useState, type ReactNode } from "react";
import type { AnalysisRepetition } from "@metrivum/api-client-web";
import { Checkbox } from "@portable-ui/react";
import { formatNumber } from "~/shared/i18n/format";
import type { Locale } from "~/shared/i18n/locale";
import { normalizePhase } from "./charts";
import styles from "./RepTable.module.css";

/** One repetition in the table; with `source` it also says which video it comes from. */
export interface RepRowData {
  id: string;
  rep: AnalysisRepetition;
  speedUnit: string;
  checked: boolean;
  onCheck?: (on: boolean) => void;
  lockCheck?: boolean;
  color?: string;
  source?: { index: number; name: string; color: string };
  current?: boolean;
  onJump?: () => void;
}

type Key =
  "order" | "duration" | "eccentric" | "pause" | "concentric" | "mean" | "peak";
/** Better is lower for times, higher for speeds; the lowering and pause phases are shown without judging them. */
const BETTER: Partial<Record<Key, "low" | "high">> = {
  duration: "low",
  concentric: "low",
  mean: "high",
  peak: "high",
};

function phaseTime(
  rep: AnalysisRepetition,
  kind: "eccentric" | "pause" | "concentric",
) {
  let total = 0;
  let found = false;
  for (const phase of rep.phases)
    if (normalizePhase(phase.kind) === kind) {
      total += phase.endSeconds - phase.startSeconds;
      found = true;
    }
  return found ? total : null;
}

function value(row: RepRowData, key: Key): number | null {
  switch (key) {
    case "order":
      return (row.source?.index ?? 0) * 1000 + row.rep.number;
    case "duration":
      return row.rep.endSeconds - row.rep.startSeconds;
    case "mean":
      return row.rep.meanSpeed ?? null;
    case "peak":
      return row.rep.peakSpeed ?? null;
    default:
      return phaseTime(row.rep, key);
  }
}

/** Red (worst) → amber → green (best), blended gradually; saturated so greens read clearly on dark and light. */
const STOPS = [
  [239, 83, 80],
  [242, 169, 59],
  [109, 255, 170],
] as const;
function tone(
  v: number | null,
  min: number,
  max: number,
  better: "low" | "high" | undefined,
) {
  // Differences under 3 % are noise, not a slow or fast rep: no colour then.
  if (
    v == null ||
    !better ||
    !(max > min) ||
    (max - min) / Math.max(Math.abs(max), 1e-9) < 0.03
  )
    return undefined;
  const t = (v - min) / (max - min);
  const good = better === "high" ? t : 1 - t;
  const [from, to, k] =
    good < 0.5
      ? [STOPS[0], STOPS[1], good * 2]
      : [STOPS[1], STOPS[2], (good - 0.5) * 2];
  return `rgb(${from.map((c, i) => Math.round(c + (to[i]! - c) * k)).join(", ")})`;
}

/** One chevron (Tabler icons), only on the sorted column: up ascending, down descending. */
function SortIcon({ dir }: { dir: 1 | -1 | 0 }) {
  if (!dir) return null;
  return (
    <svg
      className={styles.sortIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === 1 ? "M6 15l6 -6l6 6" : "M6 9l6 6l6 -6"} />
    </svg>
  );
}

/**
 * Repetitions with their total time, each phase's time and speeds. Click a header to sort; colours run from red
 * (slowest) to green (fastest) per column, and speeds also get a bar against the fastest rep.
 */
export function RepTable({
  rows,
  locale,
  label,
  showSource = false,
}: {
  rows: RepRowData[];
  locale: Locale;
  label: string;
  showSource?: boolean;
}) {
  const uiCopy = useUiCopy();

  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({
    key: "order",
    dir: 1,
  });
  const ranges = useMemo(() => {
    const out = {} as Record<Key, { min: number; max: number }>;
    for (const key of [
      "duration",
      "eccentric",
      "pause",
      "concentric",
      "mean",
      "peak",
    ] as Key[]) {
      const values = rows
        .map((row) => value(row, key))
        .filter((v): v is number => v != null);
      out[key] = { min: Math.min(...values), max: Math.max(...values) };
    }
    return out;
  }, [rows]);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const x = value(a, sort.key);
        const y = value(b, sort.key);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x - y) * sort.dir;
      }),
    [rows, sort],
  );
  const phases = (["eccentric", "pause", "concentric"] as const).filter(
    (kind) => rows.some((row) => phaseTime(row.rep, kind) != null),
  );
  const header = (key: Key, text: ReactNode, numeric = true) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={numeric ? styles.num : undefined}
        aria-sort={
          active ? (sort.dir === 1 ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          className={styles.sort}
          data-active={active || undefined}
          onClick={() =>
            setSort((current) =>
              current.key === key
                ? { key, dir: current.dir === 1 ? -1 : 1 }
                : { key, dir: BETTER[key] === "high" ? -1 : 1 },
            )
          }
        >
          {text}
          <SortIcon dir={active ? sort.dir : 0} />
        </button>
      </th>
    );
  };
  const time = (v: number | null) =>
    v == null ? "—" : `${formatNumber(locale, v, 2)} s`;
  const cell = (row: RepRowData, key: Key, text: string) => {
    const v = value(row, key);
    const color = tone(v, ranges[key].min, ranges[key].max, BETTER[key]);
    return (
      <td className={styles.num} data-empty={v == null || undefined}>
        <span className={styles.metric}>
          <span style={{ color }}>{text}</span>
        </span>
      </td>
    );
  };

  return (
    <div className={styles.wrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col" className={styles.pick}>
              <span className="tf-visually-hidden">
                {uiCopy["editor"]["sheet"]["volume"]["show"]}
              </span>
            </th>
            {header("order", showSource ? "Video · rep" : "Rep", false)}
            {header("duration", "Time")}
            {phases.includes("eccentric")
              ? header("eccentric", "Lowering")
              : null}
            {phases.includes("pause") ? header("pause", "Pause") : null}
            {phases.includes("concentric")
              ? header("concentric", "Lifting")
              : null}
            {header("mean", "Mean speed")}
            {header("peak", "Peak speed")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              data-off={row.checked ? undefined : ""}
              data-current={row.current || undefined}
            >
              <td className={styles.pick}>
                {row.onCheck ? (
                  <Checkbox
                    aria-label={formatInterfaceText(
                      uiCopy["ui"]["{0} {1}rep {2}"],
                      [
                        row.checked ? "Hide" : "Show",
                        row.source ? `${row.source.name} ` : "",
                        row.rep.number,
                      ],
                    )}
                    isSelected={row.checked}
                    isDisabled={row.lockCheck}
                    onChange={row.onCheck}
                  />
                ) : null}
              </td>
              <th scope="row">
                <span className={styles.rep}>
                  {row.color ? (
                    <i
                      className={styles.swatch}
                      style={{
                        background: row.checked ? row.color : undefined,
                      }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {row.source ? (
                    <span
                      className={styles.badge}
                      style={{ background: row.source.color }}
                    >
                      {row.source.index + 1}
                    </span>
                  ) : null}
                  {row.source && showSource ? (
                    <span className={styles.file} title={row.source.name}>
                      {uiCopy["ui"]["Vid"]} {row.source.index + 1}
                    </span>
                  ) : null}
                  {row.onJump ? (
                    <button
                      type="button"
                      className={styles.jump}
                      onClick={row.onJump}
                    >
                      {uiCopy["ui"]["Rep"]} {row.rep.number}
                    </button>
                  ) : (
                    <span className={styles.repNo}>
                      {uiCopy["ui"]["Rep"]} {row.rep.number}
                    </span>
                  )}
                </span>
              </th>
              {cell(row, "duration", time(value(row, "duration")))}
              {phases.includes("eccentric")
                ? cell(row, "eccentric", time(value(row, "eccentric")))
                : null}
              {phases.includes("pause")
                ? cell(row, "pause", time(value(row, "pause")))
                : null}
              {phases.includes("concentric")
                ? cell(row, "concentric", time(value(row, "concentric")))
                : null}
              {cell(
                row,
                "mean",
                row.rep.meanSpeed == null
                  ? "—"
                  : `${formatNumber(locale, row.rep.meanSpeed, 2)} ${row.speedUnit}`,
              )}
              {cell(
                row,
                "peak",
                row.rep.peakSpeed == null
                  ? "—"
                  : `${formatNumber(locale, row.rep.peakSpeed, 2)} ${row.speedUnit}`,
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
