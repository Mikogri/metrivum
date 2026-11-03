import { useEffect, useState } from 'react';
import { CircleAlert, Download, CirclePower, RefreshCcw, SquareTerminal } from 'lucide-react';
import { Button, Card, Disclosure, IconButton, LinkButton, TextField } from '@metrivum/ui-web';
import { useAccountContext } from '~/shared/session/AccountScope';
import { checkLocalAnalyzer, launchLocalAnalyzer, pairLocalAnalyzer, showAnalyzerWindow, storePairing, waitForLocalAnalyzer, type CompanionState } from '../local-analysis';
import { ANALYZER_CHANGED } from '../analyzer-jobs';
import styles from './AnalyzerConnection.module.css';

const DOWNLOAD = '/downloads/analyzer/MetrivumAnalyzerSetup.exe';
const RELEASE = '/downloads/analyzer/release.json';


/**
 * Connection to the companion on 127.0.0.1. It pairs automatically once (the token is kept in this browser
 * and on the computer), and can start the installed analyzer through its metrivum-analyzer:// link.
 */
export function AnalyzerConnection({ token, onTokenChange, onStateChange }: { token: string; onTokenChange: (token: string) => void; onStateChange: (state: CompanionState) => void }) {
  const { lifecycle } = useAccountContext();
  const [state, setState] = useState<CompanionState>('unreachable');
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [builtFor, setBuiltFor] = useState<string | null>(null);

  // The downloadable analyzer only answers the exact site address it was built for; say so up front.
  useEffect(() => {
    const controller = new AbortController();
    fetch(RELEASE, { signal: controller.signal, cache: 'no-store' })
      .then(response => (response.ok ? response.json() : null))
      .then((release: { webOrigin?: string } | null) => setBuiltFor(release?.webOrigin ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const account = lifecycle.signal();
    const abort = () => controller.abort(); account.addEventListener('abort', abort, { once: true });
    if (account.aborted) controller.abort();
    const check = async () => {
      if (document.visibilityState !== 'visible') { timer = setTimeout(() => void check(), 15000); return; }
      try {
        const next = await checkLocalAnalyzer(token, controller.signal);
        // Running but not paired (first time, or an old token): ask it for the token once and remember it.
        if (next === 'pairing_required') {
          const paired = await pairLocalAnalyzer(controller.signal);
          if (paired && paired !== token) { storePairing(paired); onTokenChange(paired); return; }
        }
        if (controller.signal.aborted || !lifecycle.isCurrent()) return;
        if (next === 'ready' && token) storePairing(token);
        setState(previous => {
          if (previous !== next && (next === 'ready' || next === 'analyzing')) window.dispatchEvent(new Event(ANALYZER_CHANGED));
          return next;
        });
        onStateChange(next); setChecking(false);
        if (next !== 'unreachable') setStartFailed(false);
        timer = setTimeout(() => void check(), next === 'analyzing' ? 3000 : next === 'ready' ? 15000 : 5000);
      } catch { /* Account cancellation stops polling and discards the response. */ }
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); account.removeEventListener('abort', abort); };
  }, [token, refresh, lifecycle, onStateChange, onTokenChange]);

  async function start() {
    setStarting(true); setStartFailed(false);
    launchLocalAnalyzer();
    try {
      const next = await waitForLocalAnalyzer(token, lifecycle.signal(), 45000);
      if (next === 'unreachable') setStartFailed(true);
      setRefresh(value => value + 1);
    } catch { /* account changed */ } finally { setStarting(false); }
  }

  // Brings up the analyzer's window (its log) on this computer; starting it again does the same when the call fails.
  async function openWindow() {
    try { await showAnalyzerWindow(token, lifecycle.signal()); }
    catch { launchLocalAnalyzer(); }
  }

  const here = typeof window === 'undefined' ? '' : window.location.origin;
  const wrongSite = Boolean(builtFor && here && builtFor !== here);
  const working = state === 'ready' || state === 'analyzing';
  const looking = checking && state === 'unreachable';
  const tone = looking ? 'neutral' : working ? 'ok' : state === 'pairing_required' ? 'neutral' : state === 'unreachable' || state === 'incompatible' ? 'warning' : 'danger';
  const title = looking ? 'Looking for the analyzer…' : state === 'analyzing' ? 'Analyzer is working' : state === 'ready' ? 'Analyzer ready'
    : state === 'pairing_required' ? 'Pairing with this browser…' : state === 'unreachable' ? 'Analyzer is not running'
    : state === 'incompatible' ? 'Update available' : 'Installation needs repair';
  const detail = looking ? 'Checking this computer' : state === 'analyzing' ? 'Analyzing queued videos' : state === 'ready' ? 'Paired with this browser'
    : state === 'pairing_required' ? 'Running, connecting once' : state === 'unreachable' ? 'Start it, or install it first'
    : state === 'incompatible' ? 'Needed to trim and stabilize' : 'Models or runtime files are missing';

  return <Card as="section" padding="none" className={styles.panel} aria-labelledby="analyzer-title" data-tone={tone}>
    <div className={styles.status}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.statusText} role="status">
        <strong id="analyzer-title">{title}</strong>
        <span>{detail}</span>
      </span>
      {working ? <IconButton size="sm" variant="ghost" icon={<SquareTerminal />} label="Show analyzer window" onPress={() => void openWindow()} /> : null}
      <IconButton size="sm" variant="ghost" icon={<RefreshCcw />} label="Check again" isPending={checking} onPress={() => { setChecking(true); setRefresh(value => value + 1); }} />
    </div>

    {wrongSite && !working ? <p className={styles.note} data-tone="danger"><CircleAlert aria-hidden="true" /><span>This build only works on <code>{builtFor}</code>.</span></p> : null}
    {startFailed ? <p className={styles.note} data-tone="warning"><CircleAlert aria-hidden="true" /><span>It did not start. Allow the browser to open it, or install it.</span></p> : null}

    {state === 'unreachable' || state === 'runtime_missing' || state === 'incompatible' ? <div className={styles.actions}>
      {state === 'unreachable' ? <Button size="sm" variant="primary" iconStart={<CirclePower />} loading={starting} onPress={() => void start()}>Start</Button> : null}
      <LinkButton size="sm" href={DOWNLOAD} download="MetrivumAnalyzerSetup.exe" iconStart={<Download />} variant={state === 'unreachable' ? 'secondary' : 'primary'}>{state === 'incompatible' ? 'Update' : state === 'runtime_missing' ? 'Repair' : 'Install'}</LinkButton>
    </div> : null}

    {state === 'unreachable' ? <Disclosure className={styles.more} title="First time on this computer?">
      <ol className={styles.steps}>
        <li><strong>Install</strong> Windows x64, NVIDIA GPU, ~35 GB free. If Windows warns, choose More info → Run anyway.</li>
        <li><strong>Start</strong> Start analysis opens it and pairs this browser once.</li>
      </ol>
    </Disclosure> : null}

    {state === 'pairing_required' ? <Disclosure className={styles.more} title="Pair manually">
      <div className={styles.moreBody}>
        <TextField label="Pairing token" description="Shown in the analyzer window." type="password" value={token}
          onChange={next => { setChecking(true); onStateChange('pairing_required'); onTokenChange(next); }} autoComplete="off" />
      </div>
    </Disclosure> : null}
  </Card>;
}
