import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, X } from 'lucide-react';
import { useAccountKey } from '~/shared/session/AccountScope';
import { launchLocalAnalyzer, pairLocalAnalyzer, storedPairing, storePairing } from '../local-analysis';
import styles from './AnalyzerUpdateBanner.module.css';

const DOWNLOAD = '/downloads/analyzer/MetrivumAnalyzerSetup.exe';
const COMPANION = 'http://127.0.0.1:59121';
const VERSION_KEY = 'trainflow.analyzer.observedVersion';
const validVersion = (value: unknown): value is string => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
export function newerVersion(latest: string, installed: string) {
  const a = latest.split('.').map(Number); const b = installed.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i]! > b[i]!; }
  return false;
}

type UpdateNotice = { version: string; starting: boolean; error: string; offline: boolean; updates: boolean; bannerHidden: boolean; update: () => Promise<void>; dismissBanner: () => void };
const UpdateContext = createContext<UpdateNotice | null>(null);
export const useAnalyzerUpdate = () => useContext(UpdateContext);

/** One device check feeds the banner and pinned notification; only the installed version resolves it. */
export function AnalyzerUpdateProvider({ children }: { children: ReactNode }) {
  const account = useAccountKey();
  return <AnalyzerUpdateState key={account} account={account}>{children}</AnalyzerUpdateState>;
}

function AnalyzerUpdateState({ account, children }: { account: string; children: ReactNode }) {
  const [hiddenVersion, setHiddenVersion] = useState(() => { try { return sessionStorage.getItem('trainflow.analyzer.hiddenBanner'); } catch { return null; } });
  const [observed, setObserved] = useState(() => { try { return localStorage.getItem(VERSION_KEY); } catch { return null; } });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState<AbortController | null>(null);
  useEffect(() => () => operation?.abort(), [operation, account]);
  const release = useQuery({
    queryKey: ['analyzer-release'], staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch('/downloads/analyzer/update.json', { signal, cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error('Release unavailable');
      const data = await response.json() as { version?: unknown };
      if (!validVersion(data.version)) throw new Error('Invalid release');
      return data.version;
    },
  });
  const installed = useQuery<{ version: string; updates: boolean }>({
    queryKey: [account, 'analyzer-discovery'], refetchInterval: query => query.state.data || observed ? 15_000 : false, retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${COMPANION}/discovery`, { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]), cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error('Analyzer unavailable');
      const data = await response.json() as { application?: string; version?: unknown; features?: string[] };
      if (data.application !== 'Metrivum.LocalAnalyzer' || !validVersion(data.version)) throw new Error('Unknown analyzer');
      return { version: data.version, updates: Array.isArray(data.features) && data.features.includes('updates') };
    },
  });
  useEffect(() => {
    if (!installed.data) return;
    setObserved(installed.data.version);
    try { localStorage.setItem(VERSION_KEY, installed.data.version); } catch { /* private browsing */ }
  }, [installed.data]);
  const version = installed.data?.version ?? observed;
  const available = release.data && validVersion(version) && newerVersion(release.data, version);

  const update = async () => {
    const controller = new AbortController(); setOperation(controller); setStarting(true); setError('');
    try {
      const token = storedPairing() || await pairLocalAnalyzer(controller.signal);
      if (!token) throw new Error('Open the analyzer and try again.');
      storePairing(token);
      const response = await fetch(`${COMPANION}/update`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error(response.status === 409 ? 'Finish the current analysis or upload, then update.' : 'Could not start the update. Download the installer or try again.');
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Update failed.'); }
    finally { if (!controller.signal.aborted) setStarting(false); }
  };
  return <UpdateContext.Provider value={available ? {
    version: release.data!, starting, error, offline: installed.isError, updates: !!installed.data?.updates,
    bannerHidden: hiddenVersion === release.data, update,
    dismissBanner: () => { setHiddenVersion(release.data!); try { sessionStorage.setItem('trainflow.analyzer.hiddenBanner', release.data!); } catch { /* private browsing */ } },
  } : null}>{children}</UpdateContext.Provider>;
}

/** The next step as inline text links: "Update now or download the installer" (shared by the banner and Notifications). */
export function AnalyzerUpdateActions({ className }: { className?: string }) {
  const notice = useAnalyzerUpdate();
  if (!notice) return null;
  if (notice.error) return <span className={className} role="status">{notice.error}</span>;
  const first = notice.offline ? <button type="button" className={styles.link} onClick={launchLocalAnalyzer}>Open the analyzer</button>
    : notice.updates ? <button type="button" className={styles.link} disabled={notice.starting} onClick={() => void notice.update()}>{notice.starting ? 'Starting the update…' : 'Update now'}</button> : null;
  return <span className={className}>
    {first}{first ? ' or ' : ''}<a className={styles.link} href={DOWNLOAD} download="MetrivumAnalyzerSetup.exe">{first ? 'download the installer' : 'Download the installer'}</a>
  </span>;
}

/** A thin full-width notice at the very top: what is new, the next step as inline links, and a close button. */
export function AnalyzerUpdateBanner() {
  const notice = useAnalyzerUpdate();
  if (!notice || notice.bannerHidden) return null;
  return <aside className={styles.banner} aria-label="Analyzer update available">
    <p className={styles.message}>
      <span className={styles.badge} aria-hidden="true"><ArrowUp /></span>
      <strong>Analyzer update available ({notice.version})</strong>
      <span className={styles.dot} aria-hidden="true">·</span>
      <AnalyzerUpdateActions className={styles.detail} />
    </p>
    <button type="button" className={styles.close} aria-label="Close analyzer update banner" onClick={notice.dismissBanner}><X aria-hidden="true" /></button>
  </aside>;
}
