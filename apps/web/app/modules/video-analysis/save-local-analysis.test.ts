import { expect, it, vi } from 'vitest';
import { persistLocalAnalysis, type LocalAnalysisReceipt } from './save-local-analysis';

it('uploads and finalizes video before saving a client result; retries only the failed save', async () => {
  const api = vi.fn()
    .mockResolvedValueOnce({ data: { file: { id: 'media' }, uploadUrl: 'https://storage.test/signed' } })
    .mockResolvedValueOnce({ data: { id: 'media' } })
    .mockRejectedValueOnce(new Error('Network interrupted'))
    .mockResolvedValueOnce({ data: { id: 'analysis' } });
  const upload = vi.fn().mockResolvedValue(undefined);
  const receipt = { id: 'stable-local-id', body: { name: 'Squat', sourceVideo: { durationSeconds: 10, width: 100, height: 100 } } } as LocalAnalysisReceipt;
  const signal = new AbortController().signal;
  const file = new File(['v'], 'lift.mov', { type: 'video/quicktime' });
  await expect(persistLocalAnalysis(api, file, receipt, signal, vi.fn(), upload)).rejects.toThrow('Network interrupted');
  await expect(persistLocalAnalysis(api, file, receipt, signal, vi.fn(), upload)).resolves.toMatchObject({ id: 'analysis' });
  expect(upload).toHaveBeenCalledOnce();
  expect(api.mock.calls.map(([request]) => request.path)).toEqual(['/api/v1/media/uploads', '/api/v1/media/media/finalize', '/api/v1/analyses/client-results', '/api/v1/analyses/client-results']);
  const request = api.mock.calls[3]![0];
  expect(request.json).toMatchObject({ mediaId: 'media', sourceVideo: { origin: 'cloud' } });
  expect(request.idempotencyKey).toBe('stable-local-id');
});
it('does not upload or save after account cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  const api = vi.fn(); const upload = vi.fn();
  await expect(persistLocalAnalysis(api, new File(['v'], 'v.mp4'), {} as LocalAnalysisReceipt, controller.signal, vi.fn(), upload)).rejects.toThrow();
  expect(api).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
it('retries an interrupted finalize without reserving or uploading another video', async () => {
  const api = vi.fn().mockResolvedValueOnce({ data: { file: { id: 'media' }, uploadUrl: 'https://storage.test/signed' } })
    .mockRejectedValueOnce(new Error('Finalize interrupted')).mockResolvedValueOnce({ data: { id: 'media' } }).mockResolvedValueOnce({ data: { id: 'analysis' } });
  const upload = vi.fn().mockResolvedValue(undefined);
  const receipt = { id: 'local-id', body: { sourceVideo: {} } } as LocalAnalysisReceipt;
  const file = new File(['v'], 'v.mov', { type: 'video/quicktime' }); const signal = new AbortController().signal;
  await expect(persistLocalAnalysis(api, file, receipt, signal, vi.fn(), upload)).rejects.toThrow('Finalize interrupted');
  await persistLocalAnalysis(api, file, receipt, signal, vi.fn(), upload);
  expect(upload).toHaveBeenCalledOnce();
  expect(api.mock.calls.map(([request]) => request.path)).toEqual(['/api/v1/media/uploads', '/api/v1/media/media/finalize', '/api/v1/media/media/finalize', '/api/v1/analyses/client-results']);
});
