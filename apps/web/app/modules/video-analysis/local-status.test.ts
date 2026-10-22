import { expect, it, vi } from 'vitest';
import { checkLocalAnalyzer } from './local-analysis';
const signal = () => new AbortController().signal;
const discovery = () => new Response(JSON.stringify({ application: 'TrainFlow.LocalAnalyzer', protocolVersion: 1, version: '1.3.0', features: ['jobs', 'preprocess'] }));
it('distinguishes running but unpaired from unreachable', async () => {
  const fetcher = vi.fn().mockResolvedValue(discovery());
  await expect(checkLocalAnalyzer('', signal(), fetcher)).resolves.toBe('pairing_required');
  expect(fetcher).toHaveBeenCalledOnce();
  await expect(checkLocalAnalyzer('', signal(), vi.fn().mockRejectedValue(new TypeError('Offline')))).resolves.toBe('unreachable');
});
it('checks readiness only with the explicit local pairing token', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(new Response(JSON.stringify({ protocolVersion: 1, state: 'analyzing' })));
  await expect(checkLocalAnalyzer(' token ', signal(), fetcher)).resolves.toBe('analyzing');
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer token');
  expect(fetcher.mock.calls[0]![1].headers).toBeUndefined();
});
it('rejects other local services and incompatible protocols', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ application: 'Other service', protocolVersion: 1 })));
  await expect(checkLocalAnalyzer('token', signal(), fetcher)).resolves.toBe('incompatible');
  expect(fetcher).toHaveBeenCalledOnce();
});
it('requires pairing again after an analyzer restart invalidates the token', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(new Response('', { status: 401 }));
  await expect(checkLocalAnalyzer('old-token', signal(), fetcher)).resolves.toBe('pairing_required');
});
it('asks for an update when the analyzer has no background queue', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ application: 'TrainFlow.LocalAnalyzer', protocolVersion: 1, version: '1.1.0' })));
  await expect(checkLocalAnalyzer('token', signal(), fetcher)).resolves.toBe('incompatible');
});

it('asks to update an analyzer that cannot trim or stabilize (1.2)', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ application: 'TrainFlow.LocalAnalyzer', protocolVersion: 1, version: '1.2.0', features: ['jobs'] })));
  expect(await checkLocalAnalyzer('token', new AbortController().signal, fetcher as typeof fetch)).toBe('incompatible');
});
