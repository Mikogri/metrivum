import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import NewAnalysisRoute from './new-analysis';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

const state = vi.hoisted(() => ({ enqueue: vi.fn(), api: vi.fn(), launch: vi.fn(), wait: vi.fn(), pair: vi.fn(), refresh: vi.fn(), connection: 'ready', current: true, account: new AbortController(), jobs: [] as unknown[] }));
vi.mock('~/shared/access', () => ({ RequireFeature: ({ children }: { children: ReactNode }) => children, AccessNotice: () => null, QuotaContextField: () => null, useFeatureAccess: () => ({ allowed: true }), useLimit: () => undefined, useQuotaContext: () => ({ teamId: undefined, usage: {} }) }));
vi.mock('~/shared/session/AccountScope', () => ({ useAccountContext: () => ({ api: state.api, account: { userId: 'user-1' }, accountKey: '0:user-1', lifecycle: { signal: () => state.account.signal, isCurrent: () => state.current } }) }));
vi.mock('../local-analysis', () => ({ QUEUE_LIMIT: 10, enqueueJob: state.enqueue, storedPairing: () => 'local-token', storePairing: () => {}, launchLocalAnalyzer: state.launch, waitForLocalAnalyzer: state.wait, pairLocalAnalyzer: state.pair }));
vi.mock('../analyzer-jobs', () => ({ useAnalyzerJobs: () => ({ jobs: state.jobs, refresh: state.refresh, saved: [], saving: {}, saveErrors: {} }) }));
vi.mock('../stability', () => ({ measureStability: async () => ({ state: 'stable', shift: 0 }) }));
vi.mock('../components/AnalysisQueue', () => ({ AnalysisQueue: () => null }));
vi.mock('../components/AnalyzerConnection', () => ({ AnalyzerConnection: ({ onStateChange }: { onStateChange: (state: string) => void }) => {
  useEffect(() => onStateChange(state.connection), [onStateChange]);
  return null;
} }));
vi.mock('../components/TrackingPicker', () => ({ TrackingPicker: ({ onChange, onMetadata }: { onChange: (value: unknown) => void; onMetadata: (value: unknown) => void }) => <button onClick={() => { onMetadata({ durationSeconds: 10, width: 100, height: 100 }); onChange({ timestampSeconds: 0, videoWidth: 100, videoHeight: 100, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }); }}>Mark points</button> }));
beforeEach(() => {
  state.current = true; state.account = new AbortController(); state.connection = 'ready'; state.jobs = [];
  state.enqueue.mockReset().mockImplementation(async () => ({ id: crypto.randomUUID(), state: 'queued' }));
  state.api.mockReset().mockResolvedValue({ data: {} });
  state.launch.mockReset(); state.wait.mockReset().mockResolvedValue('ready'); state.pair.mockReset().mockResolvedValue(null); state.refresh.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:local-video'); URL.revokeObjectURL = vi.fn();
});
const video = (name: string, day = 18) => new File(['video'], name, { type: 'video/quicktime', lastModified: Date.UTC(2026, 9, day, 12, 0) });
function choose(files: File[]) {
  const view = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><NewAnalysisRoute /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files } });
  return view;
}
/** The movement has no default: pick one of the main lifts, then mark the two points. */
const pickMovement = () => fireEvent.click(screen.getByRole('radio', { name: 'Squat' }));
const markAll = () => {
  for (const tab of screen.getAllByRole('tab')) { fireEvent.click(tab); pickMovement(); fireEvent.click(screen.getByRole('button', { name: 'Mark points' })); }
};

it('queues several videos with their own points for the signed-in user and keeps them on the page', async () => {
  choose([video('front.mov'), video('side.mov')]);
  markAll();
  fireEvent.click(screen.getByRole('button', { name: 'Analyze 2 videos' }));
  await waitFor(() => expect(state.enqueue).toHaveBeenCalledTimes(2));
  const [file, request, token] = state.enqueue.mock.calls[0]!;
  expect((file as File).name).toBe('front.mov');
  // Named by the recording date; trimmed and stabilized only when the coach asks (or the camera moved).
  expect(request).toMatchObject({ name: expect.stringMatching(/Oct 2026/), account: 'user-1', movement: 'squat', sourceVideo: { durationSeconds: 10 }, trim: null, stabilize: false });
  expect(token).toBe('local-token');
  expect(state.api.mock.calls[0]![0]).toMatchObject({ method: 'POST', path: '/api/v1/analyses/local-authorizations', json: { durationSeconds: 10 } });
  expect(state.api.mock.invocationCallOrder[0]).toBeLessThan(state.enqueue.mock.invocationCallOrder[0]!);
  // The videos stay visible while they are analyzed; the coach can change to another one.
  await waitFor(() => expect(screen.getAllByRole('tab').every(tab => tab.dataset.sent)).toBe(true));
  expect(screen.getAllByRole('tab')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Change video' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Start analysis/i })).toBeDisabled();
  expect(state.refresh).toHaveBeenCalled();
});

it('sends only videos with marked points; the others wait on the page', async () => {
  choose([video('a.mov'), video('b.mov')]);
  pickMovement();
  fireEvent.click(screen.getByRole('button', { name: 'Mark points' }));
  expect(screen.getByText(/1 video needs a movement and two points/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  await waitFor(() => expect(state.enqueue).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getAllByRole('tab')[0]!.dataset.sent).toBeDefined());
  expect(screen.getAllByRole('tab')[1]!.dataset.sent).toBeUndefined();
});

it('keeps the marked points when switching between videos', () => {
  choose([video('a.mov'), video('b.mov')]);
  pickMovement();
  fireEvent.click(screen.getByRole('button', { name: 'Mark points' }));
  fireEvent.click(screen.getAllByRole('tab')[1]!);
  fireEvent.click(screen.getAllByRole('tab')[0]!);
  expect(screen.getAllByRole('tab')[0]).toHaveTextContent('points marked');
});

it('says the exercise is missing when Start is pressed without it, and sends nothing', () => {
  choose([video('lift.mov')]);
  fireEvent.click(screen.getByRole('button', { name: 'Mark points' }));
  const startButton = screen.getByRole('button', { name: /Start analysis/i });
  expect(startButton).toBeEnabled();
  fireEvent.click(startButton);
  expect(screen.getByText('Choose the exercise to analyze.')).toHaveAttribute('role', 'alert');
  expect(state.enqueue).not.toHaveBeenCalled();
  pickMovement();
  expect(screen.queryByText('Choose the exercise to analyze.')).not.toBeInTheDocument();
});

it('accepts at most ten videos, counting those already in the analyzer', () => {
  state.jobs = [{ id: 'one' }, { id: 'two' }];
  choose(Array.from({ length: 12 }, (_, i) => video(`v${i}.mov`)));
  expect(screen.getAllByRole('tab')).toHaveLength(8);
  expect(screen.getByText(/Up to 10 videos at a time, including 2 already in the analyzer/)).toBeInTheDocument();
});

it('starts the installed analyzer and pairs with it when it is not running yet', async () => {
  state.connection = 'unreachable';
  state.wait.mockResolvedValue('pairing_required');
  state.pair.mockResolvedValue('A'.repeat(64));
  choose([video('lift.mov')]); markAll();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  await waitFor(() => expect(state.enqueue).toHaveBeenCalledOnce());
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.enqueue.mock.calls[0]![2]).toBe('A'.repeat(64));
});

it('explains when the analyzer cannot be started and keeps the videos', async () => {
  state.connection = 'unreachable';
  state.wait.mockResolvedValue('unreachable');
  choose([video('lift.mov')]); markAll();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  expect(await screen.findByText(/did not start/i)).toBeInTheDocument();
  expect(state.enqueue).not.toHaveBeenCalled();
  expect(screen.getAllByRole('tab')).toHaveLength(1);
});

it('stops sending when the page closes or the account changes', async () => {
  state.enqueue.mockImplementation(() => new Promise(() => {}));
  const view = choose([video('lift.mov')]); markAll();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  await waitFor(() => expect(state.enqueue).toHaveBeenCalledOnce());
  const signal = state.enqueue.mock.calls[0]![3] as AbortSignal;
  state.current = false; state.account.abort();
  expect(signal.aborted).toBe(true);
  view.unmount();
});

it('does not enqueue a video when the server rejects its monthly quota reservation', async () => {
  state.api.mockRejectedValue(new Error('Monthly local analysis limit reached.'));
  choose([video('lift.mov')]); markAll();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  expect(await screen.findByText('Monthly local analysis limit reached.')).toBeInTheDocument();
  expect(state.enqueue).not.toHaveBeenCalled();
});

it('releases its reservation after a companion enqueue failure', async () => {
  state.enqueue.mockRejectedValue(new Error('Companion rejected this video.'));
  choose([video('lift.mov')]); markAll();
  fireEvent.click(screen.getByRole('button', { name: /Start analysis/i }));
  await screen.findByText('Companion rejected this video.');
  expect(state.api.mock.calls.map(call => call[0].method)).toEqual(['POST', 'DELETE']);
});
