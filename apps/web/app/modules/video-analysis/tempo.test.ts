import { expect, it } from 'vitest';
import { liftTempo } from './tempo';
import { engineMovement, movementLabel } from './movement';

const rep = (number: number, start: number, phases: [string, number, number][]) => ({
  number, startSeconds: start, endSeconds: start + phases.reduce((sum, [, a, b]) => sum + b - a, 0),
  phases: phases.map(([kind, a, b]) => ({ kind, startSeconds: start + a, endSeconds: start + b })),
});

it('averages each phase over the reps and measures the rest between reps', () => {
  const tempo = liftTempo({ repetitions: [
    rep(1, 0, [['eccentric', 0, 2], ['pause', 2, 3], ['concentric', 3, 4]]),
    rep(2, 6, [['Eccentric', 0, 3], ['Concentric', 3, 4]]),
  ] });
  expect(tempo).toMatchObject({ lowering: 2.5, pause: 0.5, lifting: 1, between: 2, reps: 2 });
  expect(tempo?.notation).toBe('3-1-1-2');
});

it('has no tempo without phases', () => {
  expect(liftTempo({ repetitions: [{ number: 1, startSeconds: 0, endSeconds: 2, phases: [] }] })).toBeNull();
});

it('maps any exercise to the closest engine movement and labels it by the exercise', () => {
  expect(engineMovement('Back squat')).toBe('squat');
  expect(engineMovement('Wyciskanie sztangi leżąc')).toBe('bench-press');
  expect(engineMovement('Romanian deadlift')).toBe('deadlift');
  expect(engineMovement('Overhead press')).toBe('unspecified');
  expect(movementLabel({ movement: 'squat', exercise: 'Front squat' })).toBe('Front squat');
  expect(movementLabel({ movement: 'bench-press' })).toBe('Bench press');
});
