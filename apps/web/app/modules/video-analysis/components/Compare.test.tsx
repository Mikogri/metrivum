import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AnalysisResult } from '@trainflow/api-client-web';
import { expect, it, vi } from 'vitest';
import type { OverlayLine } from './charts';
import type * as Charts from './charts';
import { CompareView, type CompareSource } from './Compare';

vi.mock('~/shared/session/AccountScope', () => ({ useApi: () => vi.fn(), useAccountKey: () => 'account' }));
vi.mock('./VideoPlayer', () => ({ VideoPlayer: () => <div data-testid="video" /> }));

vi.mock('./charts', async importOriginal => ({
  ...await importOriginal<typeof Charts>(),
  OverlayChart: ({ lines, label, unit }: { lines: OverlayLine[]; label: string; unit: string }) =>
    <div role="img" aria-label={`${label} (${unit}), ${lines.length} repetitions`} data-lines={JSON.stringify(lines)} />,
}));

const rep = (number: number, start: number, mean: number) => ({ number, startSeconds: start, endSeconds: start + 2, meanSpeed: mean, peakSpeed: mean * 2, phases: [{ kind: "lowering", startSeconds: start, endSeconds: start + 2 }] });
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
  expect(screen.getByRole('img', { name: /Lowering.*3 repetitions/ })).toBeInTheDocument();
});

it('compares nonnegative speed separately for each phase, retaining gaps and all phases on the bar', () => {
  const analysis = result([{ ...rep(1, 0, 1), endSeconds: 3, phases: [
    { kind: 'lowering', startSeconds: 0, endSeconds: 1 },
    { kind: 'pause', startSeconds: 1, endSeconds: 2 },
    { kind: 'lifting', startSeconds: 2, endSeconds: 3 },
  ] }]);
  analysis.trajectory = [-8, 6, -2, null, -10, 12, -4].map((velocity, i) => ({
    ...analysis.trajectory[0]!, seconds: i / 2, y: [140, 110, 120, 125, 120, 110, 100][i]!, velocity, occluded: i === 4,
  }));
  const { rerender } = render(<CompareView sources={[sources[0]!]} results={[analysis]} />);
  const charts = screen.getAllByRole('img');
  expect(charts).toHaveLength(5);
  const data = charts.slice(1, 4).map(chart => JSON.parse(chart.getAttribute('data-lines')!)[0]);
  expect(JSON.parse(charts[0]!.getAttribute('data-lines')!)[0].y).toEqual([-15, 15, 5, 0, 15, 25]);
  expect(screen.getByRole('img', { name: /Bar path/ })).toBeInTheDocument();
  expect(data.map(line => line.x)).toEqual([[0, .5, 1], [0, .5, 1], [0, .5, 1]]);
  expect(data.map(line => line.y)).toEqual([[8, 6, 2], [2, null, null], [null, 12, 4]]);
  expect(screen.getByRole('region', { name: 'Phase times' })).toHaveTextContent('Phase times');
  expect(screen.queryByText('Velocity')).not.toBeInTheDocument();
  rerender(<CompareView sources={[sources[0]!]} results={[{ ...analysis, trajectory: analysis.trajectory.map(p => ({ ...p, velocity: null })) }]} />);
  expect(screen.queryAllByRole('img')).toHaveLength(2);
  expect(screen.getByRole('region', { name: 'Phase times' })).toBeInTheDocument();
});

it('keeps second and third lifting phases separate instead of using only the first', () => {
  const analysis = result([{ ...rep(1, 0, 1), endSeconds: 3, phases: [
    { kind: 'lifting', startSeconds: 0, endSeconds: .5 },
    { kind: 'lowering', startSeconds: .5, endSeconds: 1 },
    { kind: 'lifting', startSeconds: 1, endSeconds: 1.5 },
    { kind: 'lowering', startSeconds: 1.5, endSeconds: 2 },
    { kind: 'lifting', startSeconds: 2, endSeconds: 3 },
  ] }]);
  render(<CompareView sources={[sources[0]!]} results={[analysis]} />);
  for (const n of [1, 2, 3]) expect(screen.getByRole('img', { name: new RegExp(`Lifting ${n} from`) })).toBeInTheDocument();
  for (const n of [1, 2]) expect(screen.getByRole('img', { name: new RegExp(`Lowering ${n} from`) })).toBeInTheDocument();
  const last = JSON.parse(screen.getByRole('img', { name: /Lifting 3 from/ }).getAttribute('data-lines')!)[0];
  expect(last.x).toEqual([0, .25, .5, .75, 1]);
});
