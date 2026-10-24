import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalyzerUpdateBanner, AnalyzerUpdateProvider, useAnalyzerUpdate, newerVersion } from './AnalyzerUpdateBanner';

vi.mock('~/shared/session/AccountScope', () => ({ useAccountKey: () => 'account' }));
vi.mock('../local-analysis', () => ({ storedPairing: () => 'token', storePairing: vi.fn(), pairLocalAnalyzer: vi.fn(), launchLocalAnalyzer: vi.fn() }));
let version: string; let features: string[]; let updateStatus: number;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); version = '1.3.0'; features = ['updates']; updateStatus = 202;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('update.json')) return Response.json({ version: '1.4.0' });
    if (url.endsWith('/update')) return new Response(null, { status: updateStatus });
    return Response.json({ application: 'TrainFlow.LocalAnalyzer', version, features });
  }));
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AnalyzerUpdateProvider><AnalyzerUpdateBanner /><PinnedNotice /></AnalyzerUpdateProvider></QueryClientProvider>);
  return client;
}
function PinnedNotice() { const update = useAnalyzerUpdate(); return update ? <span data-testid="pinned-update">Unread update</span> : null; }
it('compares numeric versions rather than text', () => {
  expect(newerVersion('1.10.0', '1.9.0')).toBe(true);
  expect(newerVersion('1.4.0', '1.4.0')).toBe(false);
  expect(newerVersion('1.4.0', '2.0.0')).toBe(false);
});
it('keeps the notice after Update and removes it only after observing the installed version', async () => {
  const client = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/update'), expect.objectContaining({ method: 'POST' })));
  expect(screen.getByLabelText('Analyzer update available')).toBeInTheDocument();
  version = '1.4.0';
  await act(async () => { await client.invalidateQueries({ queryKey: ['account', 'analyzer-discovery'] }); });
  await waitFor(() => expect(screen.queryByLabelText('Analyzer update available')).not.toBeInTheDocument());
  client.clear();
});
it.each([409, 503])('retains the notice after update failure %i', async status => {
  updateStatus = status; const client = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));
  expect(await screen.findByText(status === 409 ? 'Finish the current analysis or upload, then update.' : 'Could not start the update. Download the installer or try again.')).toBeInTheDocument();
  expect(screen.getByLabelText('Analyzer update available')).toBeInTheDocument(); client.clear();
});
it('keeps a known outdated device visible across reloads while the analyzer is offline', async () => {
  localStorage.setItem('trainflow.analyzer.observedVersion', '1.3.0');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('update.json')) return Response.json({ version: '1.4.0' });
    throw new TypeError('Offline');
  }));
  const client = mount();
  expect(await screen.findByRole('button', { name: 'Open the analyzer' })).toBeInTheDocument();
  expect(screen.getByLabelText('Analyzer update available')).toBeInTheDocument();
  expect(screen.getByTestId('pinned-update')).toBeInTheDocument(); client.clear();
});
it('closing the banner does not resolve the pinned unread update', async () => {
  const client = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Close analyzer update banner' }));
  expect(screen.queryByLabelText('Analyzer update available')).not.toBeInTheDocument();
  expect(screen.getByTestId('pinned-update')).toBeInTheDocument();
  version = '1.4.0';
  await act(async () => { await client.invalidateQueries({ queryKey: ['account', 'analyzer-discovery'] }); });
  await waitFor(() => expect(screen.queryByTestId('pinned-update')).not.toBeInTheDocument()); client.clear();
});
it('offers the installer to old analyzers without hiding the notice', async () => {
  features = []; const client = mount();
  expect(await screen.findByRole('link', { name: 'Download the installer' })).toHaveAttribute('href', '/downloads/analyzer/TrainFlowAnalyzerSetup.exe');
  expect(screen.getByRole('link', { name: 'Download the installer' })).toHaveAttribute('download', 'MetrivumAnalyzerSetup.exe');
  expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument(); client.clear();
});
