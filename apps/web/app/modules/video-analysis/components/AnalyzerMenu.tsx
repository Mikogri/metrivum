import { useState } from 'react';
import { ArrowRight, CircleAlert, Clapperboard, LoaderCircle, Plus, SquareTerminal, Video } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DialogTrigger, IconButton, Popover } from '@metrivum/ui-web';
import { useFeatureAccess } from '~/shared/access';
import { formatRelative } from '~/shared/i18n/format';
import { useLocale } from '~/shared/i18n/LocaleContext';
import { useAnalyzerJobs } from '../analyzer-jobs';
import { launchLocalAnalyzer, showAnalyzerWindow, storedPairing } from '../local-analysis';
import { useAnalysisList } from '../queries';
import { JobRow, SavedRow } from './JobRow';
import styles from './AnalyzerMenu.module.css';

/**
 * App bar entry for video analyses, always there for coaches: a spinner while videos are analyzed, a dot when
 * something finished, and a menu with the queue and its progress, or the latest analyses when nothing is queued.
 */
export function AnalyzerMenu() {
  const allowed = useFeatureAccess('video.library.manage').allowed;
  const { jobs, saved, saving, saveErrors, reachable, unseen, markSeen } = useAnalyzerJobs();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const locale = useLocale();
  // The latest analyses fill the menu when the queue is empty; loaded only while it is open.
  const recent = useAnalysisList({ sort: 'newest', page: 1, pageSize: 5 }, open && allowed);
  if (!allowed) return null;

  const active = jobs.filter(job => job.state === 'queued' || job.state === 'analyzing' || saving[job.id] || job.state === 'done').length;
  const failed = jobs.some(job => job.state === 'failed' || saveErrors[job.id]);
  const shownSaved = saved.filter(item => !jobs.some(job => job.id === item.id)).slice(0, 5);
  const label = active ? `Video analyses: ${active} in progress` : 'Video analyses';
  const go = (href: string) => { setOpen(false); navigate(href); };

  return <DialogTrigger isOpen={open} onOpenChange={next => { setOpen(next); if (next) markSeen(); }}>
    <IconButton
      className={styles.trigger}
      label={label}
      variant="secondary"
      size="sm"
      showTooltip={false}
      icon={<>
        {active ? <LoaderCircle strokeWidth={1.75} className={styles.spin} /> : <Clapperboard strokeWidth={1.75} />}
        {active ? <span className={styles.count}>{active}</span> : unseen || failed ? <span className={styles.dot} data-tone={failed ? 'warning' : undefined} /> : null}
      </>}
    />
    <Popover placement="bottom end" aria-label="Video analyses" className={styles.panel}>
      <header className={styles.head}>
        <span className={styles.title}><strong>Video analyses</strong>{active ? <span className={styles.badge}>{active}</span> : null}</span>
        <span className={styles.tools}>
          {reachable ? <IconButton size="sm" variant="ghost" icon={<SquareTerminal />} label="Show analyzer window"
            onPress={() => void showAnalyzerWindow(storedPairing(), new AbortController().signal).catch(() => launchLocalAnalyzer())} /> : null}
          <IconButton size="sm" variant="ghost" icon={<Plus />} label="New analysis" onPress={() => go('/app/video-analyses/new')} />
        </span>
      </header>
      <div className={styles.body}>
        {reachable === false && jobs.length ? <p className={styles.offline}><CircleAlert aria-hidden="true" />The analyzer is not running. Waiting videos continue when it starts.</p> : null}
        {jobs.length || shownSaved.length ? <>
          <p className={styles.section}>In progress</p>
          <ul className={styles.list}>
            {jobs.map(job => <JobRow key={job.id} job={job} saving={saving[job.id]} saveError={saveErrors[job.id]} tile />)}
            {shownSaved.map(item => <SavedRow key={item.id} name={item.name} status="Ready · saved in your library" tile
              actions={<button type="button" className={styles.open} onClick={() => go(`/app/video-analyses/${item.analysisId}`)}>Open</button>} />)}
          </ul>
        </> : <>
          <p className={styles.section}>Latest analyses</p>
          {recent.data?.length ? <ul className={styles.recent}>
            {recent.data.map(analysis => <li key={analysis.id}>
              <button type="button" onClick={() => go(`/app/video-analyses/${analysis.id}`)}>
                <span className={styles.recentIcon} aria-hidden="true"><Video /></span>
                <span className={styles.recentText}>
                  <span className={styles.recentName}>{analysis.name}</span>
                  <span className={styles.recentMeta}>{formatRelative(locale, analysis.completedAt ?? analysis.createdAt)}</span>
                </span>
              </button>
            </li>)}
          </ul> : <p className={styles.empty}>{recent.isPending ? 'Loading…' : 'No analyses yet.'}</p>}
        </>}
      </div>
      <footer className={styles.foot}>
        <button type="button" className={styles.all} onClick={() => go('/app/video-analyses')}>All analyses<ArrowRight aria-hidden="true" /></button>
      </footer>
    </Popover>
  </DialogTrigger>;
}
