import { AppLocaleProvider, useAppLocale } from "~/shared/i18n/AppLocale";
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnalyzerJobsProvider, useAnalyzerJobs } from './analyzer-jobs';

const state = vi.hoisted(() => ({ list: vi.fn(), video: vi.fn(), result: vi.fn(), media: vi.fn(), remove: vi.fn(), persist: vi.fn(), toast: vi.fn(), token: 'local-token' }));
vi.mock('~/shared/access', () => ({ useFeatureAccess: () => ({ allowed: true }) }));
const scope = vi.hoisted(() => ({ api: vi.fn(), account: { userId: 'user-1' }, accountKey: '0:user-1', lifecycle: { signal: () => new AbortController().signal, isCurrent: () => true } }));
vi.mock('~/shared/session/AccountScope', () => ({ useAccountContext: () => scope }));
vi.mock('@metrivum/ui-web', () => ({ toast: state.toast }));
vi.mock('./save-local-analysis', () => ({ persistLocalAnalysis: state.persist }));
vi.mock('./local-analysis', () => ({
  AnalyzerError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
  storedPairing: () => state.token, listJobs: state.list, jobVideo: state.video, jobResult: state.result,
  rememberJobMedia: state.media, removeJob: state.remove, retryJob: vi.fn(),
}));

const done = { id: 'job-1', name: 'Heavy squat', fileName: 'squat.mov', size: 5, state: 'done', progress: 1, position: null, createdAt: '', startedAt: null, finishedAt: null,
  error: null, mediaId: null, sourceVideo: { durationSeconds: 3, width: 100, height: 100 }, configuration: { movement: 'squat', tracking: { timestampSeconds: 0, videoWidth: 100, videoHeight: 100, points: [] } } };

function Probe() {
  const { jobs, saved, saveErrors, reachable } = useAnalyzerJobs();
  return <output>{`reachable:${reachable} jobs:${jobs.length} saved:${saved.map(item => item.analysisId).join(',')} errors:${Object.values(saveErrors).join(',')}`}</output>;
}
const mount = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AnalyzerJobsProvider><Probe /></AnalyzerJobsProvider></MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  sessionStorage.clear(); state.token = 'local-token';
  localStorage.clear(); scope.api.mockReset().mockResolvedValue({ data: {} });
  for (const mock of [state.list, state.video, state.result, state.media, state.remove, state.persist, state.toast]) mock.mockReset();
  state.video.mockResolvedValue(new File(['v'], 'squat.mov'));
  state.result.mockResolvedValue({ schemaVersion: 1, trajectory: [], repetitions: [], warnings: [] });
  state.remove.mockResolvedValue(undefined);
});

it('saves a video the analyzer finished while the browser was closed, then removes it from the analyzer', async () => {
  state.list.mockResolvedValueOnce([done]).mockResolvedValue([]);
  state.persist.mockResolvedValue({ id: 'analysis-1' });
  mount();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('saved:analysis-1'));
  expect(state.list).toHaveBeenCalledWith('local-token', 'user-1', expect.any(AbortSignal));
  const [, file, receipt] = state.persist.mock.calls[0]!;
  expect((file as File).name).toBe('squat.mov');
  expect(receipt).toMatchObject({ id: 'job-1', body: { name: 'Heavy squat', configuration: { movement: 'squat' } } });
  expect(state.remove).toHaveBeenCalledWith('local-token', 'job-1', expect.any(AbortSignal));
  expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success', title: 'Analysis ready: Heavy squat' }));
});

it('keeps a finished video in the analyzer when saving fails (for example the database is down)', async () => {
  state.list.mockResolvedValue([done]);
  state.persist.mockRejectedValue(new Error('The database is temporarily unavailable.'));
  mount();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('errors:The database is temporarily unavailable.'));
  expect(state.remove).not.toHaveBeenCalled();
  expect(state.persist).toHaveBeenCalledOnce();
});

it('does not upload a video twice once the analyzer remembers its library copy', async () => {
  state.list.mockResolvedValueOnce([{ ...done, mediaId: 'media-1' }]).mockResolvedValue([]);
  state.persist.mockResolvedValue({ id: 'analysis-1' });
  mount();
  await waitFor(() => expect(state.persist).toHaveBeenCalledOnce());
  expect(state.video).not.toHaveBeenCalled();
  expect(state.persist.mock.calls[0]![2]).toMatchObject({ uploadedMediaId: 'media-1' });
});

it('never contacts the analyzer from a browser that was never paired', async () => {
  state.token = '';
  mount();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('reachable:null'));
  expect(state.list).not.toHaveBeenCalled();
});

it('synchronizes a finished result with its online authorization ID', async () => {
  localStorage.setItem('trainflow.analyzer.authorizations:user-1', JSON.stringify({ 'job-1': { id: 'permit-1', teamId: 'team-1' } }));
  state.list.mockResolvedValueOnce([done]).mockResolvedValue([]);
  state.persist.mockResolvedValue({ id: 'analysis-1' });
  mount();
  await waitFor(() => expect(state.persist).toHaveBeenCalledOnce());
  expect(state.persist.mock.calls[0]![2].body.authorizationId).toBe('permit-1');
});

it('releases a known failed run while retaining its workspace scope for a future retry', async () => {
  localStorage.setItem('trainflow.analyzer.authorizations:user-1', JSON.stringify({ 'job-1': { id: 'permit-1', teamId: 'team-1' } }));
  state.list.mockResolvedValue([{ ...done, state: 'failed', error: 'Failed inference' }]);
  mount();
  await waitFor(() => expect(scope.api).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', path: '/api/v1/analyses/local-authorizations/permit-1' })));
  await waitFor(() => expect(JSON.parse(localStorage.getItem('trainflow.analyzer.authorizations:user-1')!)).toEqual({ 'job-1': { teamId: 'team-1' } }));
  expect(state.persist).not.toHaveBeenCalled();
});

it('changes notification language without restarting or cancelling an active result upload', async () => {
  let finish!: (value: { id: string }) => void;
  state.list.mockResolvedValueOnce([done]).mockResolvedValue([]);
  state.persist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  function Language() { const { setLocale } = useAppLocale(); return <button onClick={() => setLocale('pl')}>Polish</button>; }
  render(<AppLocaleProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter><Language /><AnalyzerJobsProvider><Probe /></AnalyzerJobsProvider></MemoryRouter></QueryClientProvider></AppLocaleProvider>);
  await waitFor(() => expect(state.persist).toHaveBeenCalledOnce());
  const signal = state.persist.mock.calls[0]![3] as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Polish' }));
  expect(signal.aborted).toBe(false);
  expect(state.persist).toHaveBeenCalledOnce();
  await act(async () => finish({ id: 'analysis-pl' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Analiza gotowa: Heavy squat' })));
});
