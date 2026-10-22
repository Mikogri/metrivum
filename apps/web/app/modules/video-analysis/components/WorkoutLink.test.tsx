import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkoutLink } from './WorkoutLink';

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
  state.options.mockResolvedValue({ workouts: [workout] });
});
const mount = (canEdit = true) => render(<QueryClientProvider client={new QueryClient()}><WorkoutLink analysisId="analysis-1" version={3} canEdit={canEdit} /></QueryClientProvider>);

it("links the analysis to the client's logged set the coach picks", async () => {
  state.get.mockResolvedValue(null);
  state.link.mockResolvedValue(reference);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Link to a set' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Back squat, set 2, 5 reps × 105 kg' }));
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
