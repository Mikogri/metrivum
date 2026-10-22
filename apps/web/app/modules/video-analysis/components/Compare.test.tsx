import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AnalysisResult } from '@trainflow/api-client-web';
import { expect, it, vi } from 'vitest';
import { CompareView, type CompareSource } from './Compare';

vi.mock('~/shared/session/AccountScope', () => ({ useApi: () => vi.fn(), useAccountKey: () => 'account' }));
vi.mock('./VideoPlayer', () => ({ VideoPlayer: () => <div data-testid="video" /> }));

const rep = (number: number, start: number, mean: number) => ({ number, startSeconds: start, endSeconds: start + 2, meanSpeed: mean, peakSpeed: mean * 2, phases: [] });
const result = (reps: ReturnType<typeof rep>[]): AnalysisResult => ({
  schemaVersion: 1, engineVersion: 'e', modelVersion: 'm', method: 't', positionUnit: 'px', metersPerPixel: null, warnings: [], repetitions: reps,
  trajectory: Array.from({ length: 20 }, (_, i) => ({ seconds: i * 0.25, x: 10, y: 100 - i, velocity: 1, quality: 1, occluded: false, segment: 0 })),
});
const sources: CompareSource[] = [{ kind: 'own', id: 'a', name: 'Week 3', mediaId: 'm-a' }, { kind: 'shared', token: 't', name: 'Week 4 (Anna)', hasVideo: true }];

it('lists every rep with the video it comes from and compares the first rep of each video by default', () => {
  render(<CompareView sources={sources} results={[result([rep(1, 0, 0.5), rep(2, 2, 0.4)]), result([rep(1, 0, 0.6)])]} />);
  expect(screen.getAllByTestId('video')).toHaveLength(2);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(within(rows[2]!).getByText('Vid 2')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Hide Week 3 rep 1' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Show Week 3 rep 2' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Hide Week 4 (Anna) rep 1' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show Week 3 rep 2' }));
  expect(screen.getByRole('img', { name: /Height from the start of the rep.*3 repetitions/ })).toBeInTheDocument();
});
