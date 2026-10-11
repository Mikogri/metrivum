import { expect, it, vi } from 'vitest';
import { createAnalysis } from './api';
it('never falls back to the server GPU queue when local model is unavailable', async () => {
  const api = vi.fn();
  await expect(createAnalysis(api, { mediaId: 'video', name: 'Local', tags: [], note: null, configuration: { movement: 'squat', metersPerPixel: null } }, 'key')).rejects.toThrow('validated browser export');
  expect(api).not.toHaveBeenCalled();
});
