import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';

const features = JSON.parse(readFileSync(new URL('../../../contracts/generated/features.json', import.meta.url), 'utf8')) as { key: string }[];
const owner = '00000000-0000-4000-8000-000000000000';
const media = '10000000-0000-4000-8000-000000000001';
test('built Windows installer is served as a downloadable executable', async ({ request }) => {
  const file = new URL('../public/downloads/analyzer/MetrivumAnalyzerSetup.exe', import.meta.url);
  test.skip(!existsSync(file), 'Build the optional local Windows installer to verify its download.');
  const response = await request.head('/downloads/analyzer/MetrivumAnalyzerSetup.exe');
  expect(response.status()).toBe(200);
  expect(Number(response.headers()['content-length'])).toBe(statSync(file).size);
  expect(response.headers()['content-type']).not.toContain('text/html');
  const signature = await request.get('/downloads/analyzer/MetrivumAnalyzerSetup.exe', { headers: { Range: 'bytes=0-1' } });
  expect(signature.status()).toBe(206);
  expect((await signature.body()).toString()).toBe('MZ');
});
test('pairs local analyzer, preserves completed result on save failure and retries without rerunning ML', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(id => {
    localStorage.setItem('tf.auth.slot.0', JSON.stringify({ access_token: 'mock-0', refresh_token: 'mock-refresh-0', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: 'coach@trainflow.test', aud: 'authenticated' } }));
    localStorage.setItem('tf.auth.active-slot', '0');
  }, owner);
  await page.route('**/shared/dev/mockApi.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export const mockFetch = (input, init) => fetch(input, init);' }));
  let analyses = 0; let uploads = 0; const saved: Record<string, unknown>[] = [];
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  await page.route('http://127.0.0.1:59121/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path === '/discovery') return route.fulfill({ headers: cors, json: { application: 'Metrivum.LocalAnalyzer', protocolVersion: 1, version: '1.0.0' } });
    expect(route.request().headers().authorization).toBe('Bearer local-pairing-token');
    if (path === '/status') return route.fulfill({ headers: cors, json: { state: 'ready', protocolVersion: 1 } });
    analyses++;
    return route.fulfill({ headers: cors, json: { schemaVersion: 1, engineVersion: 'fixture', modelVersion: 'fixture', method: 'tracking', positionUnit: 'px', metersPerPixel: null, trajectory: [{ seconds: 1, x: 10, y: 20, quality: 1, occluded: false }], repetitions: [], warnings: [] } });
  });
  await page.route('https://storage.fixture.test/**', route => {
    if (route.request().method() !== 'OPTIONS') { uploads++; expect(route.request().headers().authorization).toBeUndefined(); }
    return route.fulfill({ headers: cors, status: 200, body: '' });
  });
  await page.route('http://mock.trainflow.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const respond = (json: unknown, status = 200) => route.fulfill({ headers: cors, status, json });
    if (route.request().method() === 'OPTIONS') return respond(null);
    if (path === '/api/v1/me') return respond({ id: owner, workspaceId: owner, username: 'coach_test', displayName: 'Test Coach', locale: 'en', timeZone: 'UTC', onboarded: true, version: 1, roles: ['Coach'], contexts: ['Coach'] });
    if (path === '/api/v1/me/access') return respond({ version: 'fixture', features: features.map(feature => ({ key: feature.key, available: true, reason: 'available' })), limits: [] });
    if (path === '/api/v1/media/uploads') return respond({ file: { id: media }, uploadUrl: 'https://storage.fixture.test/video' });
    if (path.endsWith('/finalize')) return respond({ id: media });
    if (path === '/api/v1/analyses/client-results') {
      saved.push(route.request().postDataJSON());
      return saved.length === 1 ? respond({ title: 'Network interrupted', status: 503, code: 'TEMPORARY_FAILURE' }, 503) : respond({ id: 'saved-local-analysis' });
    }
    if (path.includes('/messaging/') || path.endsWith('/notifications')) return respond([]);
    if (path.endsWith('/team-context')) return respond(null);
    return respond({ items: [], page: 1, pageSize: 25, total: 0, count: 0 });
  });
  await page.goto('/app/video-analyses/new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Installed and running — pairing required', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Download for Windows x64' })).toHaveAttribute('href', '/downloads/analyzer/MetrivumAnalyzerSetup.exe');
  await page.getByLabel('Local analyzer pairing token').fill('local-pairing-token');
  await expect(page.getByText('Local analyzer ready', { exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'lift.mov', mimeType: 'video/quicktime', buffer: Buffer.from('fixture-video') });
  // Deterministic metadata/preview fixture; model inference is explicitly stubbed above.
  await page.locator('video').evaluate(video => {
    Object.defineProperties(video, { duration: { value: 10 }, videoWidth: { value: 100 }, videoHeight: { value: 100 } });
    video.dispatchEvent(new Event('loadeddata'));
  });
  await page.getByRole('button', { name: 'Freeze this frame', exact: true }).click();
  const points = page.getByRole('button', { name: 'Mark tracking points on the frozen frame' });
  await points.focus(); await points.press('Enter'); await points.press('ArrowRight'); await points.press('Enter');
  await page.getByRole('button', { name: 'Start analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saving video and result' }).click();
  await expect(page.getByRole('link', { name: 'Open saved analysis' })).toBeVisible();
  expect(analyses).toBe(1); expect(uploads).toBe(1); expect(saved).toHaveLength(2);
  expect(saved[0]).toEqual(saved[1]);
  expect(saved[0]).toMatchObject({ mediaId: media, executionLocation: 'client', sourceVideo: { origin: 'cloud', durationSeconds: 10 } });
  await page.screenshot({ path: '../../.local/local-analyzer-web.png', fullPage: true });
});
