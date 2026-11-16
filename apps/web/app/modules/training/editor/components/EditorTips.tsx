import { useQuery } from "@tanstack/react-query";
import { Lightbulb, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@portable-ui/react";
import { getPerson, personKey, useProfile } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import styles from "./EditorTips.module.css";

type Mode = "table" | "sheet";
type Rect = { top: number; left: number; width: number; height: number };

/** Accounts younger than this see the tips (older ones already know the editor). */
const NEW_ACCOUNT_DAYS = 30;
const tipsKey = (userId: string, mode: Mode) =>
  `tf.editor.tips.${userId}.${mode}`;

function seen(userId: string, mode: Mode) {
  try {
    return window.localStorage.getItem(tipsKey(userId, mode)) === "done";
  } catch {
    // Without storage the tips are not shown, so they can never come back on every visit.
    return true;
  }
}

function markSeen(userId: string, mode: Mode) {
  try {
    window.localStorage.setItem(tipsKey(userId, mode), "done");
  } catch {
    // Nothing to remember without storage.
  }
}

/** The element a tip points at: marked with data-tip, or the editor's mode switch. */
function findTarget(target: string, modeLabel: string): HTMLElement | null {
  if (target === "mode")
    return document.querySelector<HTMLElement>(
      `[role="radiogroup"][aria-label="${CSS.escape(modeLabel)}"]`,
    );
  const element = document.querySelector<HTMLElement>(`[data-tip="${target}"]`);
  return element && element.getClientRects().length ? element : null;
}

function rectOf(element: HTMLElement): Rect {
  const r = element.getBoundingClientRect();
  // Large areas (the sheet, a panel) are only outlined where they are on screen.
  const top = Math.max(r.top, 8);
  const left = Math.max(r.left, 8);
  return {
    top,
    left,
    width: Math.min(r.right, window.innerWidth - 8) - left,
    height: Math.min(r.bottom, window.innerHeight - 8) - top,
  };
}

const CARD_WIDTH = 320;
const GAP = 12;

/** Where the card goes: below the target, else above, else inside its top edge; always on screen. */
function place(rect: Rect, cardHeight: number) {
  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP - cardHeight;
  const top =
    below + cardHeight < window.innerHeight - 8
      ? below
      : above > 8
        ? above
        : Math.min(rect.top + GAP, window.innerHeight - cardHeight - 8);
  const left = Math.min(
    Math.max(rect.left, 8),
    window.innerWidth - CARD_WIDTH - 8,
  );
  return {
    top,
    left,
    side: top === below ? "below" : top === above ? "above" : "inside",
  };
}

/**
 * First-run tips for the plan editor, one set for Table and one for Sheet. Shown only to new accounts,
 * one step at a time next to the part of the editor it explains. Finishing or skipping hides them for good
 * (remembered per account in this browser).
 */
export function EditorTips({
  mode,
  enabled,
}: {
  mode: Mode;
  enabled: boolean;
}) {
  const m = useT();
  const t = m.editor.tips;
  const profile = useProfile();
  const api = useApi();
  const account = useAccountKey();
  const person = useQuery({
    queryKey: personKey(account, profile.username ?? ""),
    queryFn: ({ signal }) => getPerson(api, profile.username!, signal),
    enabled: enabled && Boolean(profile.username) && !seen(profile.id, mode),
    staleTime: 5 * 60_000,
  });
  const since = person.data?.memberSince
    ? Date.parse(person.data.memberSince)
    : NaN;
  const isNew =
    Number.isFinite(since) &&
    Date.now() - since < NEW_ACCOUNT_DAYS * 86_400_000;
  const [done, setDone] = useState(() => seen(profile.id, mode));
  useEffect(() => setDone(seen(profile.id, mode)), [profile.id, mode]);
  const [ready, setReady] = useState(false);
  // Give the editor a moment to lay out before pointing at it.
  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [mode]);
  const show = enabled && ready && isNew && !done;
  const steps = mode === "table" ? t.table : t.sheet;
  const close = useCallback(() => {
    markSeen(profile.id, mode);
    setDone(true);
  }, [profile.id, mode]);
  return show ? (
    <Tour
      key={mode}
      steps={steps}
      onClose={close}
      modeLabel={m.editor.mode.label}
    />
  ) : null;
}

function Tour({
  steps,
  onClose,
  modeLabel,
}: {
  steps: readonly { target: string; title: string; body: string }[];
  onClose: () => void;
  modeLabel: string;
}) {
  const t = useT().editor.tips;
  // Steps whose part is not on screen (e.g. read-only tools) are left out.
  const [available] = useState(() =>
    steps.filter((step) => findTarget(step.target, modeLabel)),
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [leaving, setLeaving] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const step = available[index];

  const measure = useCallback(() => {
    const element = step ? findTarget(step.target, modeLabel) : null;
    setRect(element ? rectOf(element) : null);
  }, [step, modeLabel]);

  useLayoutEffect(() => {
    const element = step ? findTarget(step.target, modeLabel) : null;
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [step, modeLabel, measure]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [index]);

  const finish = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  useEffect(() => {
    if (!available.length) onClose();
  }, [available.length, onClose]);

  if (!step || !rect) return null;
  const last = index === available.length - 1;
  const spot = place(rect, cardHeight);
  return createPortal(
    <div className={styles.layer} data-leaving={leaving || undefined}>
      <div
        className={styles.ring}
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
        aria-hidden="true"
      />
      <div
        ref={card}
        className={styles.card}
        role="dialog"
        aria-label={t.label}
        aria-describedby="editor-tip-body"
        data-side={spot.side}
        style={{ top: spot.top, left: spot.left, width: CARD_WIDTH }}
      >
        <div key={index} className={styles.content}>
          <div className={styles.head}>
            <span className={styles.icon} aria-hidden="true">
              <Lightbulb />
            </span>
            <span className={styles.count}>
              {t.step(index + 1, available.length)}
            </span>
            <button
              type="button"
              className={styles.close}
              aria-label={t.skip}
              title={t.skip}
              onClick={finish}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <strong className={styles.title}>{step.title}</strong>
          <p id="editor-tip-body" className={styles.body}>
            {step.body}
          </p>
        </div>
        <div className={styles.foot}>
          <span className={styles.dots} aria-hidden="true">
            {available.map((item, n) => (
              <span
                key={item.target + n}
                data-active={n === index || undefined}
                data-done={n < index || undefined}
              />
            ))}
          </span>
          {index > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setIndex((n) => n - 1)}
            >
              {t.back}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onPress={finish}>
              {t.skip}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            autoFocus
            onPress={() => (last ? finish() : setIndex((n) => n + 1))}
          >
            {last ? t.done : t.next}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
