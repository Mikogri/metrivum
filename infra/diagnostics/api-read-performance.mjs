import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Sequential development-only reads; response bodies and credentials never enter the report.
const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8').replace(/^\uFEFF/, ''));
const config = read('apps/api/Metrivum.Api/appsettings.Local.json');
const target = read('infra/development-target.json');
if (process.argv[2] !== '--confirm-development' || target.environment !== 'development' ||
    config.Supabase.Auth.ProjectUrl !== `https://${target.supabaseProjectRef}.supabase.co`)
  throw new Error('Confirmed development target required.');
const spec = read('contracts/generated/openapi.json');
const accounts = read('.local/demo/state.json').accounts;
const password = readFileSync(new URL('.local/demo/password.txt', root), 'utf8').trim();
const auth = createClient(config.Supabase.Auth.ProjectUrl, config.Storage.SecretKey,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const output = { startedAt: new Date().toISOString(), samples: [], unexercised: [] };
const all = Object.entries(spec.paths).flatMap(([path, operations]) => Object.entries(operations)
  .filter(([method]) => ['get','post','put','patch','delete'].includes(method)).map(([method, op]) => ({ path, method, op })));
for (const actor of [accounts.find(a => a.role === 'Coach'), accounts.find(a => a.role !== 'Coach')].filter(Boolean)) {
  const { data, error } = await auth.auth.signInWithPassword({ email: actor.email, password });
  if (error) throw new Error('Demo sign-in failed.');
  const bodies = new Map();
  const reads = all.filter(x => x.method === 'get').sort((a,b) => a.path.split('/').length - b.path.split('/').length);
  for (const endpoint of reads) {
    let path = endpoint.path;
    for (const match of [...path.matchAll(/\{([^}]+)\}/g)]) {
      const prefix = path.slice(0, match.index).replace(/\/$/, '');
      const body = bodies.get(prefix);
      const items = Array.isArray(body) ? body : body?.items ?? body?.data ?? body?.results;
      const id = Array.isArray(items) ? items[0]?.id : undefined;
      if (id) path = path.replace(match[0], encodeURIComponent(id));
    }
    if (path.includes('{')) { output.unexercised.push({ role: actor.role, method: 'get', path: endpoint.path, reason: 'No discovered fixture ID' }); continue; }
    const params = new URLSearchParams();
    for (const p of endpoint.op.parameters ?? []) {
      if (p.in !== 'query' || !p.required) continue;
      const value = p.schema?.default ?? p.schema?.enum?.[0];
      if (value !== undefined) params.set(p.name, String(value));
    }
    for (let sample = 0; sample < 3; sample++) {
      const start = performance.now();
      try {
        const response = await fetch(`http://127.0.0.1:59120${path}${params.size ? '?' + params : ''}`,
          { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: AbortSignal.timeout(30000) });
        const bytes = await response.arrayBuffer();
        output.samples.push({ role: actor.role, path: endpoint.path, sample, status: response.status, ms: +(performance.now()-start).toFixed(2), bytes: bytes.byteLength });
        if (response.ok) { try { bodies.set(path, JSON.parse(new TextDecoder().decode(bytes))); } catch { /* Non-JSON reads are still timed. */ } }
        if (!response.ok) break;
      } catch { output.samples.push({ role: actor.role, path: endpoint.path, sample, status: 'transport-error', ms: +(performance.now()-start).toFixed(2) }); break; }
    }
  }
}
for (const endpoint of all.filter(x => x.method !== 'get')) output.unexercised.push({ method: endpoint.method, path: endpoint.path, reason: 'Requires isolated mutation scenario' });
mkdirSync(new URL('.local/performance/', root), { recursive: true });
writeFileSync(new URL('.local/performance/api-reads.json', root), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ requests: output.samples.length, successful: output.samples.filter(x => x.status >= 200 && x.status < 300).length, unexercised: output.unexercised.length }));
