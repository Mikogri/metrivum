import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkoutLink } from './WorkoutLink';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ get: vi.fn(), link: vi.fn(), unlink: vi.fn(), options: vi.fn() }));
vi.mock('~/shared/session/AccountScope', () => ({ useApi: () => vi.fn(), useAccountKey: () => 'account' }));
vi.mock('../api', () => ({ getWorkoutLink: state.get, linkWorkout: state.link, unlinkWorkout: state.unlink, analysisSetOptions: state.options }));

const workout = { executionId: 'exec-1', relationshipId: 'rel-1', clientId: 'client-1', clientName: 'Anna', performedDate: '2026-10-18', workoutName: 'Lower A', status: 'Completed',
  exercises: [{ id: 'ex-1', name: 'Back squat', sets: [{ id: 'set-1', number: 1, skipped: false, reps: 5, load: 100, loadUnit: 'kg', rpe: null }, { id: 'set-2', number: 2, skipped: false, reps: 5, load: 105, loadUnit: 'kg', rpe: null }] }] };
const set = { executionId: 'exec-1', setId: 'set-2', relationshipId: 'rel-1', clientId: 'client-1', clientName: 'Anna', performedDate: '2026-10-18', workoutName: 'Lower A',
  exerciseName: 'Back squat', setNumber: 2, reps: 5, load: 105, loadUnit: 'kg' };
const reference = { set, sharedWithClient: true };

beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockReset();
  state.options.mockImplementation(async (_api, query) => ({ workouts: [query.includeSets ? workout : { ...workout, exercises: [] }] }));
});
const mount = (canEdit = true) => render(<QueryClientProvider client={new QueryClient()}><WorkoutLink analysisId="analysis-1" version={3} canEdit={canEdit} /></QueryClientProvider>);

it("links the analysis to the client's logged set the coach picks", async () => {
  state.get.mockResolvedValue(null);
  state.link.mockResolvedValue(reference);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Link to a set' }));
  await screen.findByText('Lower A');
  expect(state.options).toHaveBeenCalledWith(expect.anything(), { days: 60, includeSets: false }, expect.any(AbortSignal));
  expect(screen.queryByRole('button', { name: 'Back squat, set 2, 5 reps × 105 kg' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show sets' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Back squat, set 2, 5 reps × 105 kg' }));
  expect(state.options).toHaveBeenLastCalledWith(expect.anything(), { days: 60, includeSets: true, relationshipId: 'rel-1', executionId: 'exec-1' }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  await waitFor(() => expect(state.link).toHaveBeenCalledWith(expect.anything(), 'analysis-1', { workoutExecutionId: 'exec-1', setId: 'set-2', shareWithClient: true }, 3));
});

it('shows the linked set and lets the coach remove the link', async () => {
  state.get.mockResolvedValue(reference);
  state.unlink.mockResolvedValue(undefined);
  mount();
  expect(await screen.findByText('Back squat · Set 2 (5 reps × 105 kg)')).toBeInTheDocument();
  expect(screen.getByText(/Anna · .* · Lower A/)).toBeInTheDocument();
  expect(screen.getByText('Visible to Anna at this set')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
  await waitFor(() => expect(state.unlink).toHaveBeenCalledWith(expect.anything(), 'analysis-1', 3));
});

it('is read-only without the library permission', async () => {
  state.get.mockResolvedValue(null);
  mount(false);
  expect(await screen.findByText('Not linked to a logged set.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Link to a set' })).toBeNull();
});

it('loads only the expanded workout, reuses cached sets and can link a whole workout without loading them', async () => {
  state.get.mockResolvedValue(null);
  state.link.mockResolvedValue(reference);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Link to a set' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Whole workout' }));
  expect(state.options).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Show sets' }));
  await screen.findByRole('button', { name: 'Back squat, set 1, 5 reps × 100 kg' });
  fireEvent.click(screen.getByRole('button', { name: 'Hide sets' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show sets' }));
  expect(state.options).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  await waitFor(() => expect(state.link).toHaveBeenCalledWith(expect.anything(), 'analysis-1', { workoutExecutionId: 'exec-1', setId: null, shareWithClient: true }, 3));
});

it('filters on the server and clears a selection from the previous client', async () => {
  const user = userEvent.setup();
  state.get.mockResolvedValue(null);
  state.options.mockImplementation(async (_api, query) => ({ workouts: query.relationshipId === 'rel-2'
    ? [{ ...workout, executionId: 'exec-2', relationshipId: 'rel-2', clientName: 'Bob', exercises: [] }]
    : [{ ...workout, exercises: [] }, { ...workout, executionId: 'exec-2', relationshipId: 'rel-2', clientName: 'Bob', exercises: [] }] }));
  mount();
  await user.click(await screen.findByRole('button', { name: 'Link to a set' }));
  await user.click((await screen.findAllByRole('button', { name: 'Whole workout' }))[0]!);
  expect(screen.getByRole('button', { name: 'Link' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /All clients/ }));
  await user.click(await screen.findByRole('option', { name: 'Bob' }));
  await waitFor(() => expect(state.options).toHaveBeenCalledWith(expect.anything(), { days: 60, relationshipId: 'rel-2', includeSets: false }, expect.any(AbortSignal)));
  expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Whole workout' })).toHaveLength(1);
});

it('aborts an unfinished set request when the picker closes', async () => {
  state.get.mockResolvedValue(null);
  let detailSignal: AbortSignal | undefined;
  state.options.mockImplementation((_api, query, signal: AbortSignal) => {
    if (query.includeSets) { detailSignal = signal; return new Promise(() => {}); }
    return Promise.resolve({ workouts: [{ ...workout, exercises: [] }] });
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Link to a set' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show sets' }));
  await waitFor(() => expect(detailSignal).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(detailSignal!.aborted).toBe(true));
  expect(state.link).not.toHaveBeenCalled();
});
