import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { HeartPulse, Ruler, Scale, Target, TriangleAlert, UserRound, Zap } from "lucide-react";
import type { Details } from "./ProfileDetails";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import styles from "./BodySummary.module.css";

type Tone = "green" | "violet" | "blue" | "orange" | "rose";

const has = (n: number) => !Number.isNaN(n);

/**
 * The private body and training details as a summary instead of a list of fields: key numbers up top, sleep and
 * stress as meters, the training week as seven days, equipment as tags and notes as quotes. Empty parts are left out.
 */
export function BodySummary({ details, empty, showSex = true }: { details: Details; empty?: string; showSex?: boolean }) {
 const uiCopy = useUiCopy();

  const m = useT();
  const t = m.profile.body;
  const u = m.profile.units;
  const { locale } = useAppLocale();
  const n = (value: number, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  const bmi = has(details.Height) && has(details.Weight) && details.Height > 0 ? details.Weight / (details.Height / 100) ** 2 : NaN;

  const metrics: { icon: typeof Ruler; tone: Tone; label: string; value: string; unit?: string }[] = [];
  if (showSex && details.Sex) metrics.push({ icon: UserRound, tone: "violet", label: m.profile.fields.Sex ?? "Sex", value: m.onboarding.sexOptions[details.Sex] ?? details.Sex });
  if (has(details.Height)) metrics.push({ icon: Ruler, tone: "blue", label: m.profile.fields.Height ?? "Height", value: n(details.Height, 0), unit: u.cm });
  if (has(details.Weight)) metrics.push({ icon: Scale, tone: "green", label: m.profile.fields.Weight ?? "Weight", value: n(details.Weight), unit: u.kg });
  if (has(bmi)) metrics.push({ icon: Target, tone: "violet", label: t.bmi, value: n(bmi) });
  if (has(details.BodyFat)) metrics.push({ icon: Zap, tone: "orange", label: m.profile.fields.BodyFat ?? "Body fat", value: n(details.BodyFat), unit: u.percent });
  if (has(details.HrMax)) metrics.push({ icon: HeartPulse, tone: "rose", label: m.profile.fields.HrMax ?? "Max heart rate", value: n(details.HrMax, 0), unit: u.bpm });

  const days = new Set(details.PreferredTrainingDays);
  const training = [details.TrainingExperience, details.ActivityLevel].filter((x) => x.trim());
  const rhythm = [
    has(details.SessionsPerWeek) ? t.perWeek(n(details.SessionsPerWeek, 0)) : null,
    has(details.AvailableSessionDuration) ? `${n(details.AvailableSessionDuration, 0)} ${u.minutes}` : null,
  ].filter(Boolean);
  const showTraining = training.length || rhythm.length || days.size;
  const showRecovery = has(details.Sleep) || has(details.Stress);
  const notes = [
    { icon: TriangleAlert, tone: "orange" as Tone, label: m.profile.fields.InjuriesLimitationsPainNotes ?? "", text: details.InjuriesLimitationsPainNotes.trim() },
    { icon: Target, tone: "green" as Tone, label: m.profile.fields.AdditionalNotes ?? "", text: details.AdditionalNotes.trim() },
  ].filter((note) => note.text);

  if (!metrics.length && !showTraining && !showRecovery && !details.AvailableEquipment.length && !notes.length) return empty ? <p className={styles.empty}>{empty}</p> : null;
  return (
    <div className={styles.summary}>
      {metrics.length ? (
        <ul className={styles.metrics} style={{ "--n": metrics.length } as React.CSSProperties}>
          {metrics.map((item) => {
            return (
              <li key={item.label}>
                <span className={styles.metricLabel}>{item.label}</span>
                <span className={styles.metricValue}>
                  {item.value}
                  {item.unit ? <small>{item.unit}</small> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showTraining || showRecovery ? (
        <div className={styles.panels}>
          {showTraining ? (
            <section className={styles.panel} aria-label={t.training}>
              <h3 className={styles.panelTitle}>
                {t.training}
              </h3>
              {training.length || rhythm.length ? (
                <p className={styles.line}>
                  {[...training, ...rhythm].map((part, i) => (
                    <span key={i} className={styles.pill}>
                      {part}
                    </span>
                  ))}
                </p>
              ) : null}
              <ol className={styles.week} aria-label={m.profile.fields.PreferredTrainingDays}>
                {m.onboarding.weekdays.map((day, i) => (
                  <li key={day} data-on={days.has(i + 1) || undefined} aria-label={`${day}${days.has(i + 1) ? ` — ${t.trainingDay}` : ""}`}>
                    {day.slice(0, 2)}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {showRecovery ? (
            <section className={styles.panel} aria-label={t.recovery}>
              <h3 className={styles.panelTitle}>
                {t.recovery}
              </h3>
              {has(details.Sleep) ? <Meter label={m.profile.fields.Sleep ?? uiCopy.ui.Sleep} value={details.Sleep} max={10} text={`${n(details.Sleep)} ${u.hours}`} tone="violet" /> : null}
              {has(details.Stress) ? <Meter label={m.profile.fields.Stress ?? uiCopy.ui.Stress} value={details.Stress} max={10} text={`${n(details.Stress, 0)}/10`} tone={details.Stress >= 7 ? "rose" : details.Stress >= 4 ? "orange" : "green"} /> : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {details.AvailableEquipment.length ? (
        <div className={styles.equipment}>
          <span className={styles.caption}>{m.profile.fields.AvailableEquipment}</span>
          <ul className={styles.tags}>
            {details.AvailableEquipment.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes.length ? (
        <div className={styles.notes}>
          {notes.map((note) => {
            return (
              <blockquote key={note.label} className={styles.note} data-tone={note.tone}>
                <span className={styles.caption}>{note.label}</span>
                <p>{note.text}</p>
              </blockquote>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Meter({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone: Tone }) {
  return (
    <div className={styles.meterRow}>
      <span className={styles.meterLabel}>{label}</span>
      <span className={styles.meter} data-tone={tone} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, value / max))})` }} />
      </span>
      <span className={styles.meterValue}>{text}</span>
    </div>
  );
}
