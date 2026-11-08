import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dumbbell, Eye, EyeOff, Link2, Unlink } from 'lucide-react';
import type { AnalysisSetReference, AnalysisWorkoutLink, AnalysisWorkoutOption } from '@metrivum/api-client-web';
import { Alert, Button, Checkbox, Dialog, EmptyState, Option, Select, Skeleton, toast } from '@metrivum/ui-web';
import { formatDate, formatNumber } from '~/shared/i18n/format';
import type { Locale } from '~/shared/i18n/locale';
import { useLocale } from '~/shared/i18n/LocaleContext';
import { errorText } from '~/shared/lib/errorText';
import { useT } from '~/shared/i18n/AppLocale';
import { useAccountKey, useApi } from '~/shared/session/AccountScope';
import { analysisSetOptions, getWorkoutLink, linkWorkout, unlinkWorkout } from '../api';
import { videoKeys } from '../queries';
import styles from './WorkoutLink.module.css';

const linkKey = (account: string, analysisId: string) => [account, 'video', 'workout-link', analysisId] as const;

function setText(locale: Locale, set: { reps?: number | null; load?: number | null; loadUnit?: string | null }) {
  const parts = [set.reps != null ? `${set.reps} reps` : null, set.load != null ? `${formatNumber(locale, set.load, 1)} ${set.loadUnit ?? ''}`.trim() : null].filter(Boolean);
  return parts.join(' × ');
}

// Logged dates have no time of day: format them as they are, not shifted by the viewer's time zone.
const day = (locale: Locale, date: string) => formatDate(locale, `${date}T00:00:00Z`, { dateStyle: 'medium' }, 'UTC');

/** What the analysis is linked to, in one line: client · date · workout · exercise · set. */
export function describeLink(locale: Locale, link: AnalysisSetReference) {
  const set = link.setNumber ? `Set ${link.setNumber}${setText(locale, link) ? ` (${setText(locale, link)})` : ''}` : 'Whole workout';
  return { title: link.exerciseName ? `${link.exerciseName} · ${set}` : set, detail: `${link.clientName} · ${day(locale, link.performedDate)} · ${link.workoutName}` };
}

/**
 * The coach links this analysis to one logged set of a client (or a whole logged workout), so the video sits next to
 * the numbers it shows. Only the owner of the analysis sees and changes the link.
 */
export function WorkoutLink({ analysisId, version, canEdit }: { analysisId: string; version: number; canEdit: boolean }) {


  const api = useApi();
  const account = useAccountKey();
  const locale = useLocale();
  const m = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const link = useQuery({ queryKey: linkKey(account, analysisId), queryFn: ({ signal }) => getWorkoutLink(api, analysisId, signal) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: linkKey(account, analysisId) });
    void queryClient.invalidateQueries({ queryKey: videoKeys.analysis(account, analysisId) });
  };
  const unlink = useMutation({
    mutationFn: () => unlinkWorkout(api, analysisId, version),
    onSuccess: () => { refresh(); toast({ tone: 'success', title: m["ui"]["Link to the set removed"] }); },
    onError: (error) => toast({ tone: 'danger', title: errorText(m, error) }),
  });

  const share = useMutation({
    mutationFn: (shared: boolean) => linkWorkout(api, analysisId, { workoutExecutionId: link.data!.set.executionId, setId: link.data!.set.setId ?? null, shareWithClient: shared }, version),
    onSuccess: (next) => { refresh(); toast({ tone: 'success', title: next.sharedWithClient ? `Shared with ${next.set.clientName}` : `Hidden from ${next.set.clientName}` }); },
    onError: (error) => toast({ tone: 'danger', title: errorText(m, error) }),
  });
  const current = link.data ? describeLink(locale, link.data.set) : null;
  return <section className={styles.link} aria-labelledby={`link-${analysisId}`}>
    <h3 id={`link-${analysisId}`} className={styles.label}>{m["ui"]["Linked set"]}</h3>
    {link.isPending ? <Skeleton height="2.5rem" radius="md" /> : current ? <div className={styles.current}>
      <span className={styles.icon} aria-hidden="true"><Dumbbell /></span>
      <span className={styles.text}>
        <strong>{current.title}</strong>
        <span>{current.detail}</span>
        <span className={styles.visibility} data-shared={link.data!.sharedWithClient || undefined}>
          {link.data!.sharedWithClient ? <><Eye aria-hidden="true" />{m["ui"]["Visible to"]} {link.data!.set.clientName}  {m["ui"]["at this set"]}</> : <><EyeOff aria-hidden="true" />{m["ui"]["Only you can see it"]}</>}
        </span>
      </span>
      {canEdit ? <span className={styles.actions}>
        <Button size="sm" variant="secondary" loading={share.isPending} onPress={() => share.mutate(!link.data!.sharedWithClient)}>{link.data!.sharedWithClient ? m["video"]["share"]["revoke"] : m["ui"]["Share with client"]}</Button>
        <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>{m["ui"]["Change"]}</Button>
        <Button size="sm" variant="ghost" iconStart={<Unlink />} loading={unlink.isPending} onPress={() => unlink.mutate()}>{m["ui"]["Unlink"]}</Button>
      </span> : null}
    </div> : <div className={styles.none}>
      <span>{m["ui"]["Not linked to a logged set."]}</span>
      {canEdit ? <Button size="sm" variant="secondary" iconStart={<Link2 />} onPress={() => setOpen(true)}>{m["ui"]["Link to a set"]}</Button> : null}
    </div>}
    {open ? <LinkDialog analysisId={analysisId} version={version} current={link.data ?? null} onClose={() => setOpen(false)} onLinked={refresh} /> : null}
  </section>;
}

function LinkDialog({ analysisId, version, current: link, onClose, onLinked }: { analysisId: string; version: number; current: AnalysisWorkoutLink | null; onClose: () => void; onLinked: () => void }) {


  const current: AnalysisSetReference | null = link?.set ?? null;
  const [shareWithClient, setShareWithClient] = useState(link?.sharedWithClient ?? true);
  const api = useApi();
  const account = useAccountKey();
  const locale = useLocale();
  const m = useT();
  const [client, setClient] = useState<string>(current?.relationshipId ?? 'all');
  const [days, setDays] = useState('60');
  const [choice, setChoice] = useState<{ executionId: string; setId: string | null } | null>(current ? { executionId: current.executionId, setId: current.setId ?? null } : null);
  // The directory contains summaries only; sets are fetched for one expanded workout.
  const directory = useQuery({
    queryKey: [account, 'video', 'set-options', 'directory', days] as const,
    queryFn: ({ signal }) => analysisSetOptions(api, { days: Number(days), includeSets: false }, signal),
  });
  const options = useQuery({
    queryKey: [account, 'video', 'set-options', 'client', client, days] as const,
    queryFn: ({ signal }) => analysisSetOptions(api, { days: Number(days), relationshipId: client, includeSets: false }, signal),
    enabled: client !== 'all',
  });
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const workout of directory.data?.workouts ?? []) seen.set(workout.relationshipId, workout.clientName);
    if (current) seen.set(current.relationshipId, current.clientName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [directory.data, current]);
  const selected = client === 'all' ? directory : options;
  const workouts = selected.data?.workouts ?? [];
  const save = useMutation({
    mutationFn: () => linkWorkout(api, analysisId, { workoutExecutionId: choice!.executionId, setId: choice!.setId, shareWithClient }, version),
    onSuccess: (next) => { onLinked(); onClose(); toast({ tone: 'success', title: next.sharedWithClient ? `Linked and shared with ${next.set.clientName}` : 'Analysis linked', description: describeLink(locale, next.set).title }); },
  });

  return <Dialog isOpen onOpenChange={next => { if (!next) onClose(); }} placement="right" size="lg" title={m["ui"]["Link to a logged set"]}
    description={m["ui"]["Choose the set this video shows. Only sets your clients have logged appear here."]}
    closeLabel={m.common.close}
    footer={close => <>
      <Checkbox isSelected={shareWithClient} onChange={setShareWithClient} className={styles.shareBox}>{m["ui"]["Show it to the client at this set"]}</Checkbox>
      <Button variant="secondary" onPress={close}>{m.common.cancel}</Button>
      <Button variant="primary" isDisabled={!choice} loading={save.isPending} onPress={() => save.mutate()}>{m["ui"]["Link"]}</Button>
    </>}>
    <div className={styles.dialog}>
      <div className={styles.filters}>
        <Select label={m["profile"]["roles"]["Client"]} selectedKey={client} onSelectionChange={key => { setClient(String(key)); setChoice(null); }}>
          <Option id="all">{m["ui"]["All clients"]}</Option>
          {clients.map(([id, name]) => <Option key={id} id={id}>{name}</Option>)}
        </Select>
        <Select label={m["ui"]["Logged in the last"]} selectedKey={days} onSelectionChange={key => { setDays(String(key)); setChoice(null); }}>
          <Option id="14">{m["ui"]["14 days"]}</Option><Option id="60">{m["ui"]["60 days"]}</Option><Option id="180">{m["ui"]["180 days"]}</Option><Option id="365">{m["ui"]["year"]}</Option>
        </Select>
      </div>
      {save.error ? <Alert tone="danger" title={errorText(m, save.error)} /> : null}
      {selected.isPending ? <Skeleton height="12rem" radius="lg" />
        : selected.isError ? <Alert tone="danger" title={errorText(m, selected.error)} />
        : !workouts.length ? <EmptyState size="sm" title={m["ui"]["No logged workouts"]} description={m["ui"]["When a client logs a workout, its sets can be linked here."]} />
        : <ol className={styles.workouts}>
          {workouts.map(workout => <WorkoutOption key={`${client}:${days}:${workout.executionId}`} workout={workout} days={Number(days)} locale={locale} choice={choice} onChoose={setChoice} showClient={client === 'all'} />)}
        </ol>}
    </div>
  </Dialog>;
}

function WorkoutOption({ workout, days, locale, choice, onChoose, showClient }: { workout: AnalysisWorkoutOption; days: number; locale: Locale; choice: { executionId: string; setId: string | null } | null; onChoose: (value: { executionId: string; setId: string | null }) => void; showClient: boolean }) {


  const [expanded, setExpanded] = useState(false);
  const api = useApi();
  const account = useAccountKey();
  const m = useT();
  const detail = useQuery({
    queryKey: [account, 'video', 'set-options', 'execution', workout.relationshipId, workout.executionId, days],
    queryFn: ({ signal }) => analysisSetOptions(api, { days, relationshipId: workout.relationshipId, executionId: workout.executionId, includeSets: true }, signal),
    enabled: expanded,
    staleTime: 30_000,
  });
  const chosen = (setId: string | null) => choice?.executionId === workout.executionId && choice.setId === setId;
  return <li className={styles.workout}>
    <div className={styles.workoutHead}>
      <span>
        <strong>{workout.workoutName}</strong>
        <span className={styles.muted}>{day(locale, workout.performedDate)}{showClient ? ` · ${workout.clientName}` : ''}{workout.status === 'InProgress' ? m["ui"][" · in progress"] : ''}</span>
      </span>
      <button type="button" className={styles.whole} aria-pressed={chosen(null)} onClick={() => onChoose({ executionId: workout.executionId, setId: null })}>{m["ui"]["Whole workout"]}</button>
    </div>
    <Button variant="ghost" size="sm" aria-expanded={expanded} onPress={() => setExpanded(value => !value)}>{expanded ? m["ui"]["Hide sets"] : m["ui"]["Show sets"]}</Button>
    {expanded && detail.isPending ? <Skeleton height="3rem" /> : null}
    {expanded && detail.isError ? <Alert tone="danger" title={errorText(m, detail.error)} /> : null}
    {expanded && detail.data?.workouts.find(item => item.executionId === workout.executionId)?.exercises.map(exercise => <div key={exercise.id} className={styles.exercise}>
      <span className={styles.exerciseName}>{exercise.name}</span>
      <span className={styles.sets} role="group" aria-label={formatInterfaceText(m["ui"]["{0} sets"], [exercise.name])}>
        {exercise.sets.map(set => <button key={set.id} type="button" className={styles.set} aria-pressed={chosen(set.id)} data-skipped={set.skipped || undefined}
          onClick={() => onChoose({ executionId: workout.executionId, setId: set.id })} aria-label={formatInterfaceText(m["ui"]["{0}, set {1}{2}"], [exercise.name,set.number,setText(locale, set) ? `, ${setText(locale, set)}` : ''])}>
          <b>{set.number}</b>
          <span>{set.skipped ? m["ui"]["skipped"] : setText(locale, set) || '—'}</span>
        </button>)}
      </span>
    </div>)}
  </li>;
}
