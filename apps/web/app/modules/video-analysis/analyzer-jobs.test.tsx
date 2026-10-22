import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnalyzerJobsProvider, useAnalyzerJobs } from './analyzer-jobs';

const state = vi.hoisted(() => ({ list: vi.fn(), video: vi.fn(), result: vi.fn(), media: vi.fn(), remove: vi.fn(), persist: vi.fn(), toast: vi.fn(), token: 'local-token' }));
vi.mock('~/shared/access', () => ({ useFeatureAccess: () => ({ allowed: true }) }));
const scope = vi.hoisted(() => ({ api: () => {}, account: { userId: 'user-1' }, accountKey: '0:user-1', lifecycle: { signal: () => new AbortController().signal, isCurrent: () => true } }));
vi.mock('~/shared/session/AccountScope', () => ({ useAccountContext: () => scope }));
vi.mock('@trainflow/ui-web', () => ({ toast: state.toast }));
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
