import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Business records go through the local API. Only new, tagged demo identities use Auth admin.
const tag = 'metrivum-demo-20261101';
const target = JSON.parse(readFileSync('infra/development-target.json', 'utf8'));
const config = JSON.parse(readFileSync('apps/api/Metrivum.Api/appsettings.Local.json', 'utf8').replace(/^\uFEFF/, ''));
if (process.argv[2] !== '--confirm-development' || target.environment !== 'development' || target.supabaseProjectRef !== 'atclvdkpbccafakzpwls' || new URL(config.Supabase.Auth.ProjectUrl).hostname !== `${target.supabaseProjectRef}.supabase.co`)
  throw new Error('Explicit confirmation of the recorded development target is required.');
const database = config.ConnectionStrings?.Database ?? '';
const connectionPart = name => database.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]*)`, 'i'))?.[1]?.trim();
if (connectionPart('Host') !== target.sessionPoolerHost || connectionPart('Database') !== target.database || connectionPart('Username') !== `trainflow_api.${target.supabaseProjectRef}`)
  throw new Error('Local API settings must use the recorded development database and restricted runtime role.');
mkdirSync('.local/demo', { recursive: true });
const statePath = '.local/demo/state.json', passwordPath = '.local/demo/password.txt';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { tag, accounts: [], operations: {}, requests: 0, day: new Date().toISOString().slice(0, 10) };
if (state.tag !== tag) throw new Error('Unexpected demo state.');
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
if (!existsSync(passwordPath)) writeFileSync(passwordPath, `Metrivum!${randomBytes(9).toString('base64url')}7a`);
const password = readFileSync(passwordPath, 'utf8').trim();
const origin = 'http://localhost:59120';
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.Supabase.Auth.ProjectUrl, config.Storage.SecretKey, authOptions);
const sessions = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const date = offset => { const d = new Date(`${state.day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const list = x => Array.isArray(x) ? x : x.items ?? x.data ?? [];
async function api(actor, method, path, body, version, key) {
  const headers = { Authorization: `Bearer ${sessions.get(actor.id)}`, 'Content-Type': 'application/json' };
  if (version != null) headers['If-Match'] = `"${version}"`;
  if (key) {
    const h = createHash('sha256').update(`${tag}:${key}`).digest('hex').slice(0, 32);
    headers['Idempotency-Key'] = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(origin + '/api/v1' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90000), redirect: 'error' });
    if (r.status === 429) { await sleep(Math.max(1000, Number(r.headers.get('Retry-After') ?? 10) * 1000)); continue; }
    const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`${method} ${path}: non-JSON HTTP ${r.status}`); }
    if (!r.ok) throw new Error(`${actor.username} ${method} ${path}: HTTP ${r.status} ${JSON.stringify(data)}`);
    state.requests++; return data;
  }
  throw new Error(`Rate limit persisted: ${method} ${path}`);
}
async function step(key, action) {
  if (Object.hasOwn(state.operations, key)) return state.operations[key];
  const result = await action(); state.operations[key] = result; save(); return result;
}
const mutate = (a, key, method, path, body, version) => step(key, () => api(a, method, path, body, version, key));
const get = (a, path) => api(a, 'GET', path);
async function main() {
  if (!(await fetch(origin + '/health/ready')).ok) throw new Error('Local API is not ready.');
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Auth inventory failed (${error.status}).`);
    users.push(...data.users); if (data.users.length < 100) break;
  }
  const names = ['Adam Nowak','Julia Kowalska','Marek Zielinski','Emma Wilson','Daniel Brooks','Anna Wisniewska','Piotr Lewandowski','Zofia Kaminska','Jan Wojcik','Laura Mazur','Tomasz Krawczyk','Maja Piotrowska','Jakub Grabowski','Natalia Pawlak','Michal Michalski','Olivia Smith','Noah Johnson','Amelia Brown','Liam Davis','Sophie Miller'];
  for (let i = 0; i < 20; i++) {
    const role = i < 5 ? 'Coach' : 'Client', n = i < 5 ? i + 1 : i - 4;
    const username = `demo${role.toLowerCase()}${String(n).padStart(2, '0')}`, email = `${username}@metrivum.test`;
    let user = users.find(u => u.email?.toLowerCase() === email);
    if (user && user.user_metadata?.demo_seed !== tag) throw new Error(`Unrelated identity already owns ${email}.`);
    if (!user) {
      const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { demo_seed: tag, display_name: names[i] } });
      if (result.error) throw new Error(`Auth create ${email} failed (${result.error.status}, ${result.error.code}).`);
      user = result.data.user;
    }
    const auth = createClient(config.Supabase.Auth.ProjectUrl, config.Storage.SecretKey, authOptions);
    const signed = await auth.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error(`Demo login failed for ${email} (${signed.error.status}).`);
    sessions.set(user.id, signed.data.session.access_token);
    const account = { id: user.id, email, username, name: names[i], role };
    if (!state.accounts.some(a => a.id === user.id)) { state.accounts.push(account); save(); }
    await mutate(account, `${username}:onboarding`, 'PUT', '/me/onboarding', { username, displayName: names[i], firstName: names[i].split(' ')[0], lastName: names[i].split(' ').slice(1).join(' '), birthDate: `${1984 + i % 15}-05-12`, acceptedTerms: true, locale: 'en', timeZone: 'Europe/Warsaw', role });
    const profile = await get(account, '/me');
    if (!profile.onboarded || profile.username !== username || !profile.roles.includes(role)) throw new Error(`Invalid demo profile: ${username}`);
    console.log(`Account ready: ${username} (${role})`);
  }
  if (!process.argv.includes('--verify-only') || !existsSync('.local/demo/accounts.md')) writeFileSync('.local/demo/accounts.md', '# Development demo accounts\n\nShared password: `' + password + '`\n\n' + state.accounts.map(a => `- ${a.email} — ${a.name} (${a.role})`).join('\n') + '\n');
  if (process.argv.includes('--accounts-only')) return;
  if (process.argv.includes('--profiles-only')) { await seedProfiles(); await verifyDemo(); return; }
  if (process.argv.includes('--verify-only')) { await verifyDemo(); return; }
  if (!process.argv.includes('--extras-only')) await seedBusiness();
  await seedExtras();
  await seedProfiles();
  await verifyDemo();
}

async function seedProfiles() {
  for (let i = 0; i < state.accounts.length; i++) {
    const a = state.accounts[i], profile = await get(a, '/me/profile-fields');
    await mutate(a, `${a.username}:profile-fields`, 'PATCH', '/me/profile-fields', { values: { Height: 164 + i % 9 * 3, Weight: 62 + i % 8 * 4, HrMax: 180 + i % 16, SessionsPerWeek: 3, AvailableSessionDuration: 60, Sleep: 6.5 + i % 3 * 0.5, TrainingExperience: 'Synthetic demo: consistent training for two years.', Country: i % 3 ? 'PL' : 'GB', City: i % 3 ? 'Warsaw' : 'London', PreferredTrainingDays: [1,3,5], AvailableEquipment: ['Barbell','Dumbbells','Bench'], AdditionalNotes: 'Synthetic development profile. Not a real person.' } }, profile.version);
  }
  const coaches = state.accounts.filter(a => a.role === 'Coach');
  for (const [ownerIndex, memberIndex] of [[3,2],[4,1],[4,0]]) {
    const owner = coaches[ownerIndex], member = coaches[memberIndex], team = state.operations[`${ownerIndex}:team-quote`];
    const invitation = await mutate(owner, `team-member:${ownerIndex}:${memberIndex}`, 'POST', `/teams/${team.teamId}/invitations`, { username: member.username, role: 'Member' });
    if (memberIndex !== 0) await mutate(member, `team-member:${ownerIndex}:${memberIndex}:accept`, 'POST', `/teams/requests/${invitation.id}/decision`, { accept: true });
  }
  const mapping = coaches.map((coach, i) => `| ${coach.email} | ${['Free','Starter','Pro','Team workspace','Studio workspace'][i]} | democlient${String(i * 3 + 1).padStart(2, '0')}–democlient${String(i * 3 + 3).padStart(2, '0')} |`).join('\n');
  writeFileSync('.local/demo/accounts.md', readFileSync('.local/demo/accounts.md', 'utf8') + '\n## Suggested starting points\n\n| Coach | Subscription/workspace | Clients |\n| --- | --- | --- |\n' + mapping + '\n\nEach client has two completed assignments and one active assignment. Client addresses end with `@metrivum.test`. Within each group of three clients, their personal subscriptions are Free, Starter and Pro. All payments are simulated.\n');
}

async function seedExtras() {
  const coaches = state.accounts.filter(a => a.role === 'Coach'), clients = state.accounts.filter(a => a.role === 'Client');
  const catalog = list(await get(coaches[0], '/subscriptions/plans'));
  const outcomes = await Promise.allSettled(coaches.map(async (coach, ci) => {
    const key = suffix => `${coach.username}:${suffix}`;
    const offers = [0,1,2].map(n => state.operations[key(`offer:${n}:publish`)]);
    for (let i = 0; i < 3; i++) {
      const client = clients[ci * 3 + i], ck = suffix => key(`${client.username}:${suffix}`), relationshipId = state.operations[ck('relationship')];
      if (!relationshipId) throw new Error(`Run base fixtures first: ${client.username}`);
      for (let d = 0; d < 4; d++) {
        const actor = d > 1 ? client : coach;
        await mutate(actor, ck(`document:${d}`), 'POST', `/coaching/relationships/${relationshipId}/documentation/documents`, { title: `Demo ${['Coaching guidelines','Coach private review','Training journal','Client private notes'][d]}`, description: 'Synthetic development document.', category: 'Training', visibility: d % 2 ? 'CoachPrivate' : 'SharedWithClient', text: 'Development example. Goals: consistent sessions, controlled technique and gradual progression. No real medical or personal information.', mediaId: null, observedAt: date(-14 + d * 3) + 'T12:00:00Z' });
      }
      const method = await mutate(client, ck('payment-method'), 'POST', '/me/payment-methods/simulated-card', { label: 'Demo successful payment (simulated)', outcome: 'Success' });
      const declined = await mutate(client, ck('declined-method'), 'POST', '/me/payment-methods/simulated-card', { label: 'Demo declined payment (simulated)', outcome: 'Decline' });
      const dues = list(await get(client, '/me/payment-dues?pageSize=100'));
      for (const due of dues.filter(d => d.status === 'AwaitingPayment')) {
        if (i === 0) await mutate(client, ck(`due:${due.id}:paid`), 'POST', `/me/payment-dues/${due.id}/pay`, { paymentMethodId: method.id, idempotencyKey: `${tag}:due:${due.id}:success` });
        if (i === 1) await mutate(client, ck(`due:${due.id}:declined`), 'POST', `/me/payment-dues/${due.id}/pay`, { paymentMethodId: declined.id, idempotencyKey: `${tag}:due:${due.id}:declined` });
      }
      if (i > 0) {
        const planId = i === 1 ? 'Starter' : 'Pro', price = catalog.find(p => p.id === planId);
        const checkout = await mutate(client, ck('platform-checkout'), 'POST', '/me/platform-subscription/checkout', { planId, priceVersion: price.priceVersion, autoRenew: false });
        await mutate(client, ck('platform-paid'), 'POST', '/me/platform-subscription/confirm-payment', { dueId: checkout.pendingDue.id, paymentMethodId: method.id, idempotencyKey: `${tag}:client-plan:${client.id}` });
      }
      const requests = list(await get(client, '/check-ins/requests?pageSize=100&role=client'));
      let submittedCount = 0;
      for (const request of requests) {
        if (['Submitted','Reviewed','Cancelled'].includes(request.status) || submittedCount >= 4) continue;
        const detail = await get(client, `/check-ins/requests/${request.id}`);
        if (new Date(detail.request.availableAtUtc) > new Date()) continue;
        const submitted = await mutate(client, ck(`checkin:${request.id}:submitted`), 'POST', `/check-ins/requests/${request.id}/submit`, { answers: { goal: 'Training was consistent. Recovery is improving; the final sets were challenging.', energy: 3 + submittedCount % 3 } }, detail.request.version);
        if (submittedCount % 2 === 0) await mutate(coach, ck(`checkin:${request.id}:reviewed`), 'POST', `/check-ins/requests/${request.id}/review`, { clientReply: 'Thanks for the update. Keep the planned progression.', coachPrivateNotes: 'Demo review: monitor recovery.' }, submitted.request.version);
        submittedCount++;
      }
      console.log(`Extra history ready: ${client.username}`);
    }
    // Other demo clients supply pending leads and invitations without changing existing collaborations.
    for (let l = 0; l < 4; l++) {
      const prospect = clients[(ci * 3 + 3 + l) % clients.length], offer = offers[l % 2];
      if (l < 2) {
        await mutate(coach, key(`invitation:${l}`), 'POST', '/coaching/invitations', { username: prospect.username, offerId: offer.id, billingOptionId: offer.billingOptions[0].id, message: 'Demo invitation: discuss your goals and a possible coaching collaboration.' });
      } else {
        let app = await mutate(prospect, key(`lead:${l}`), 'POST', '/coaching/applications', { offerId: offer.id, billingOptionId: offer.billingOptions[0].id });
        await mutate(prospect, key(`lead:${l}:submit`), 'POST', `/coaching/applications/${app.application.id}/submit`, { answers: { goal: 'Build strength and improve technique. Please send more details about coaching.', energy: 4 } }, app.application.version);
      }
    }
  }));
  const failures = outcomes.filter(r => r.status === "rejected");
  if (failures.length) throw new Error(failures.map(r => r.reason.message).join("\n"));
  await verifyDemo();
}

async function verifyDemo() {
  const summary = { tag, verifiedAt: new Date().toISOString(), accounts: [], totals: { accounts: 20, coaches: 5, clients: 15, completedWorkouts: 0, skippedWorkouts: 0 } };
  for (const account of state.accounts) {
    const subscription = await get(account, '/me/platform-subscription');
    const conversations = await get(account, '/messaging/conversations?pageSize=100');
    const assignments = await get(account, '/training/assignments?pageSize=100');
    const row = { ...account, plan: subscription.planId, conversations: list(conversations).length, assignments: list(assignments).length };
    if (account.role === 'Coach') {
      const { teams } = await get(account, '/teams/mine');
      row.teams = teams.map(t => ({ id: t.id, name: t.name, role: t.role, members: t.members, occupiedSeats: t.occupiedSeats }));
      for (const team of teams.filter(t => t.isOwner)) {
        const billing = await get(account, `/teams/${team.id}/billing`);
        row.teams.find(t => t.id === team.id).plan = billing.planId;
        if (billing.occupiedSeats < 2 || !['Team','Studio'].includes(billing.planId)) throw new Error(`Incomplete demo team: ${team.name}`);
      }
    }
    if (account.role === 'Client') {
      const schedule = list(await get(account, `/training/schedule?from=${date(-49)}&to=${date(0)}&pageSize=100`));
      row.completedWorkouts = schedule.filter(o => o.status === 'Completed').length;
      row.skippedWorkouts = schedule.filter(o => o.status === 'Skipped').length;
      summary.totals.completedWorkouts += row.completedWorkouts;
      summary.totals.skippedWorkouts += row.skippedWorkouts;
      if (row.assignments < 3 || row.completedWorkouts < 10) throw new Error(`Insufficient training history: ${account.username}`);
    }
    summary.accounts.push(row);
  }
  const counts = (suffix) => Object.keys(state.operations).filter(k => k.endsWith(suffix)).length;
  summary.created = { trainingDocuments: Object.keys(state.operations).filter(k => /:plan:\d$/.test(k)).length, revisions: Object.keys(state.operations).filter(k => /:plan:\d:apply:\d$/.test(k)).length, assignments: counts(':assign:0') + counts(':assign:1') + counts(':assign:2'), measurements: Object.keys(state.operations).filter(k => /:measurement:(weight|waist):\d$/.test(k)).length, notes: Object.keys(state.operations).filter(k => /:note:\d$/.test(k)).length, messages: Object.keys(state.operations).filter(k => /:message:\d+$/.test(k)).length, calendarEvents: Object.keys(state.operations).filter(k => /:event:\d$/.test(k)).length, documents: Object.keys(state.operations).filter(k => /:document:\d$/.test(k)).length, reviewedCheckins: counts(':reviewed'), submittedCheckins: counts(':submitted') };
  const foreignPlan = state.operations['democoach02:plan:0'];
  const denied = await fetch(origin + `/api/v1/training/programs/${foreignPlan.id}`, { headers: { Authorization: `Bearer ${sessions.get(state.accounts[0].id)}` }, redirect: 'error' });
  if (denied.status !== 404) throw new Error(`Unexpected cross-owner plan access: HTTP ${denied.status}`);
  summary.foreignPlanHidden = true;
  writeFileSync('.local/demo/verification.json', JSON.stringify(summary, null, 2));
  console.log('Verified all demo accounts through owner-authorized API reads.');
}

async function seedBusiness() {
  const coaches = state.accounts.filter(a => a.role === 'Coach'), clients = state.accounts.filter(a => a.role === 'Client');
  const catalog = await get(coaches[0], '/subscriptions/plans');
  console.log('Subscription catalog:', list(catalog).map(p => `${p.id}:${p.priceVersion}`).join(', '));
  const exercises = list(await get(coaches[0], '/exercises?page=1&pageSize=100'));
  if (exercises.length < 8) throw new Error('Exercise catalogue is missing.');
  state.exerciseChoices = exercises.slice(0, 16).map(e => ({ id: e.id, name: e.name })); save();
  const outcomes = await Promise.allSettled(coaches.map(async (coach, ci) => {
    const planId = ['Free','Starter','Pro','Team','Studio'][ci], ownClients = clients.slice(ci * 3, ci * 3 + 3);
    if (planId !== 'Free') {
      const price = list(catalog).find(p => p.id === planId);
      if (!price?.priceVersion) throw new Error(`No configured price for ${planId}`);
      if (ci < 3) {
        const checkout = await mutate(coach, `${ci}:checkout`, 'POST', '/me/platform-subscription/checkout', { planId, priceVersion: price.priceVersion, autoRenew: false });
        await mutate(coach, `${ci}:paid`, 'POST', '/me/platform-subscription/confirm-payment', { dueId: checkout.pendingDue.id, idempotencyKey: `${tag}:plan:${ci}` });
      } else {
        const quote = await mutate(coach, `${ci}:team-quote`, 'POST', '/teams/checkout-quote', { teamName: `Demo ${planId} Performance`, purchasedSeats: ci === 3 ? 3 : 10, priceVersion: price.priceVersion, autoRenew: false, planId });
        state.teamQuoteShape = Object.keys(quote); save();
        await mutate(coach, `${ci}:team-paid`, 'POST', '/teams/confirm-purchase', { quoteId: quote.id ?? quote.quoteId, idempotencyKey: `${tag}:team:${ci}` });
      }
    }
    console.log(`Subscription ready: ${coach.username} / ${planId}`);
    await seedCoach(coach, ownClients, ci, exercises);
  }));
  const failures = outcomes.filter(r => r.status === "rejected");
  if (failures.length) throw new Error(failures.map(r => r.reason.message).join("\n"));
}

function document(exercises, stage, owner) {
  const workouts = [1, 3, 5].map((dayNumber, di) => ({ id: randomUUID(), dayNumber, workouts: [{
    id: randomUUID(), name: ['Full body A','Full body B','Strength and conditioning'][di], description: 'Synthetic development training session.',
    exercises: Array.from({ length: 5 }, (_, ei) => ({ id: randomUUID(), exerciseId: exercises[(owner * 7 + di * 5 + ei) % exercises.length].id, comment: 'Keep controlled technique; stop if painful.',
      sets: Array.from({ length: 4 }, (_, si) => ({ id: randomUUID(), kind: si === 0 ? 'Warmup' : si === 3 ? 'BackOff' : 'Standard', prescription: {
        reps: { minimum: 8 - stage, maximum: 10 - stage }, load: { minimum: { value: 20 + ei * 5 + stage * 2.5, unit: 'Kg' }, maximum: { value: 20 + ei * 5 + stage * 2.5, unit: 'Kg' } },
        rpe: si === 0 ? 5 : 7, rest: { value: 90, unit: 'Seconds' }, tempo: '3-0-1-0'
      } })) })), groups: []
  }] }));
  const workout = workouts[0].workouts[0];
  workout.groups.push({ id: randomUUID(), kind: 'Superset', exerciseIds: workout.exercises.slice(3).map(e => e.id), rounds: 4, restSeconds: 60 });
  return { schemaVersion: 1, blocks: [{ id: randomUUID(), name: ['Foundation','Strength progression','Current training'][stage], description: 'Demo block with warmups, working sets and back-off sets.', cycles: [{ id: randomUUID(), name: 'Seven-day cycle', description: 'Three workouts and four recovery days.', dayCount: 7, repeats: stage === 2 ? 4 : 2, days: workouts }] }], annotations: [{ id: randomUUID(), kind: 'Goal', title: 'Technique and consistency', content: 'Complete the scheduled sessions and record an honest RPE.', visibility: 'Client' }, { id: randomUUID(), kind: 'Comment', title: 'Coach review', content: 'Synthetic development notes. Review progression after the next block.', visibility: 'Coach' }] };
}

async function seedCoach(coach, clients, ci, exercises) {
  const key = suffix => `${coach.username}:${suffix}`;
  const forms = [];
  for (let f = 0; f < 4; f++) {
    const form = await mutate(coach, key(`form:${f}`), 'POST', '/forms', { purpose: f === 0 ? 'Application' : 'CheckIn', name: `Demo ${['Coaching application','Weekly recovery','Training readiness','Monthly review'][f]}`, description: 'Synthetic development form.', draft: { sections: [{ key: 'main', title: 'Your training', order: 0, questions: [{ key: 'goal', label: f === 0 ? 'What would you like to achieve?' : 'How has training been going?', type: 'LongText', required: true, maxLength: 2000 }, { key: 'energy', label: 'Energy level', type: 'Number', min: 1, max: 5, required: false }] }] } });
    forms.push(await mutate(coach, key(`form:${f}:publish`), 'POST', `/forms/${form.id}/publish`, undefined, form.version));
  }
  const offers = [];
  for (let oi = 0; oi < 3; oi++) {
    const offer = await mutate(coach, key(`offer:${oi}`), 'POST', '/offers', { name: `Demo ${['Personal coaching','Monthly strength coaching','Free introductory consultation'][oi]}`, description: 'Synthetic development offer. Payments are simulated.', category: 'strength', coachingMode: 'Online', applicationFormVersionId: oi === 2 ? null : forms[0].currentPublishedVersionId, tags: ['demo','strength'], billingOptions: [{ id: randomUUID(), name: ['Single session','Monthly coaching','Free consultation'][oi], model: oi === 1 ? 'PeriodSubscription' : 'PerSession', price: oi === 2 ? 0 : oi === 1 ? 120 : 35, ...(oi === 1 ? { periodCount: 1, periodUnit: 'Month' } : { validityDays: 60 }) }] });
    offers.push(await mutate(coach, key(`offer:${oi}:publish`), 'POST', `/offers/${offer.id}/publish`, undefined, offer.version));
  }
  const programs = [];
  for (let p = 0; p < 4; p++) {
    let plan = await mutate(coach, key(`plan:${p}`), 'POST', '/training/programs', { name: `Demo ${['Foundation - completed','Strength block - completed','Current performance plan','Full body template'][p]}`, description: 'Synthetic development plan with multiple sessions and revisions.', kind: p === 3 ? 'Template' : 'Program', folderId: null, document: document(exercises, Math.min(p, 2), ci) });
    if (JSON.stringify(plan.document).includes('"3010"')) {
      const doc = JSON.parse(JSON.stringify(plan.document).replaceAll('"3010"', '"3-0-1-0"'));
      plan = await mutate(coach, key(`plan:${p}:tempo`), 'PUT', `/training/programs/${plan.id}/draft`, { name: plan.name, description: plan.description, folderId: null, document: doc }, plan.version);
    }
    if (p === 3) continue;
    let revision;
    for (let v = 0; v < 3; v++) {
      if (v > 0) {
        const doc = structuredClone(plan.document);
        for (const block of doc.blocks) for (const cycle of block.cycles) for (const day of cycle.days) for (const w of day.workouts) for (const ex of w.exercises) for (const set of ex.sets) { set.prescription.load.minimum.value += 2.5; set.prescription.load.maximum.value += 2.5; }
        plan = await mutate(coach, key(`plan:${p}:save:${v}`), 'PUT', `/training/programs/${plan.id}/draft`, { name: plan.name, description: `${plan.description} Revision ${v + 1}.`, folderId: null, document: doc }, plan.version);
      }
      revision = await mutate(coach, key(`plan:${p}:apply:${v}`), 'POST', `/training/programs/${plan.id}/apply`, undefined, plan.version);
    }
    programs.push({ plan, revision });
  }
  const groups = [];
  for (let g = 0; g < 3; g++) groups.push(await mutate(coach, key(`group:${g}`), 'POST', '/coaching/groups', { name: `Demo ${['Strength athletes','Consistency challenge','Technique review'][g]}`, description: 'Synthetic development group.', color: ['#A855F7','#F59E0B','#EC4899'][g] }));
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i], ck = suffix => key(`${client.username}:${suffix}`), offer = offers[i % offers.length];
    let app = await mutate(client, ck('application'), 'POST', '/coaching/applications', { offerId: offer.id, billingOptionId: offer.billingOptions[0].id });
    app = await mutate(client, ck('submit'), 'POST', `/coaching/applications/${app.application.id}/submit`, { answers: i === 2 ? {} : { goal: 'Improve strength, technique and training consistency.', energy: 4 } }, app.application.version);
    const accepted = await mutate(coach, ck('accepted'), 'POST', `/coaching/applications/${app.application.id}/accept`, { settlementMode: 'Simulated' }, app.application.version);
    const relationshipId = accepted.relationshipId;
    if (!relationshipId) throw new Error('Accepted demo application did not create a relationship.');
    state.operations[ck('relationship')] = relationshipId; save();
    for (let g = 0; g < groups.length; g++) if ((g + i) % 3 !== 2) {
      const group = await get(coach, `/coaching/groups/${groups[g].id}`);
      await mutate(coach, ck(`group:${g}`), 'PUT', `/coaching/groups/${group.id}/members/${relationshipId}`, undefined, group.version);
    }
    for (let p = 0; p < programs.length; p++) {
      const { plan, revision } = programs[p];
      const batch = await mutate(coach, ck(`assign:${p}`), 'POST', `/training/programs/${plan.id}/assignments`, { revisionId: revision.id, relationshipIds: [relationshipId], groupIds: [], startDate: date([-42,-28,-7][p]), timeZone: 'Europe/Warsaw' });
      const assignment = batch.assignments[0];
      const schedule = list(await get(client, `/training/schedule?from=${date(-49)}&to=${date(0)}&programId=${plan.id}&pageSize=100`)).filter(o => o.assignmentId === assignment.id && o.scheduledDate <= date(0));
      for (let wi = 0; wi < schedule.length; wi++) {
        const occurrence = schedule[wi], wk = `workout:${occurrence.id}`;
        if ((wi + i + p) % 7 === 6) { await mutate(client, ck(wk + ':skip'), 'POST', `/training/workouts/${occurrence.id}/skip`, { reason: 'Demo recovery day: rescheduled after a busy workday.' }); continue; }
        const detail = await get(client, `/training/workouts/${occurrence.id}`);
        let execution = await mutate(client, ck(wk + ':start'), 'POST', `/training/workouts/${occurrence.id}/start`);
        const actual = detail.prescription.workout.exercises.map((ex, ei) => ({ prescribedInstanceId: ex.id, exerciseId: ex.exerciseId, comment: 'Demo training log.', sets: ex.sets.map((s, si) => ({ prescribedSetId: s.id, prescribedSegmentId: null, skipped: si === 3 && wi % 5 === 3, reps: 8 - p + (wi % 3 === 0 ? -1 : 0), load: 20 + ei * 5 + p * 2.5 + (wi % 2 ? 2.5 : 0), loadUnit: 'kg', loadMeaning: 'TotalExternal', rpe: 6 + (wi + si) % 4, rir: null, durationSeconds: null, distanceMeters: null, restSeconds: 90, tempo: '3-0-1-0', comment: '' })) }));
        execution = await mutate(client, ck(wk + ':save'), 'PUT', `/training/executions/${execution.id}`, { performedDate: occurrence.scheduledDate, durationSeconds: 2400 + wi * 120, comment: 'Synthetic training history for development testing.', exercises: actual }, execution.version);
        execution = await mutate(client, ck(wk + ':complete'), 'POST', `/training/executions/${execution.id}/complete`, undefined, execution.version);
        if (wi % 4 !== 3) await mutate(client, ck(wk + ':feedback'), 'PUT', `/training/executions/${execution.id}/feedback`, { rating: 3 + wi % 3, sessionRpe: 6 + wi % 4, wellbeing: 3 + (wi + 1) % 3, sleepQuality: 2 + wi % 4, note: ['Good energy and controlled repetitions.','Busy day; shortened rest intervals.','Felt recovered and ready for progression.'][wi % 3] }, execution.version);
      }
      if (p < 2) {
        const current = await get(coach, `/training/assignments/${assignment.id}`);
        await mutate(coach, ck(`assignment:${p}:completed`), 'PUT', `/training/assignments/${assignment.id}/status`, { status: 'Completed' }, current.version);
      }
      console.log(`Training ready: ${client.username}, plan ${p + 1}, ${schedule.length} historical sessions`);
    }
    for (let m = 0; m < 8; m++) for (const [measurement, unit, value] of [['weight','kg',68 + ci * 4 + i * 3 - m * 0.3],['waist','cm',80 + i * 2 - m * 0.4]])
      await mutate(coach, ck(`measurement:${measurement}:${m}`), 'POST', `/coaching/relationships/${relationshipId}/documentation/measurements`, { key: measurement, unit, value, observedAt: date(-50 + m * 7) + 'T08:00:00Z', comment: 'Synthetic weekly progress measurement.' });
    for (let n = 0; n < 6; n++) await mutate(coach, ck(`note:${n}`), 'POST', `/coaching/relationships/${relationshipId}/documentation/notes`, { title: `Demo coaching review ${n + 1}`, text: ['Technique improving. Maintain the current working weights.','Discussed sleep and recovery; adjust volume if needed.','Progression looks sustainable. Review again after this block.'][n % 3] });
    for (let n = 0; n < 4; n++) await mutate(coach, ck(`max:${n}`), 'POST', `/training/clients/${relationshipId}/exercise-maxes`, { exerciseId: exercises[n].id, reps: n % 2 ? 5 : 1, load: { value: 45 + ci * 10 + i * 5 + n * 10, unit: 'Kg' }, recordedOn: date(-21 + n * 7), alias: `demoMax${n + 1}` });
    const conversation = await mutate(coach, ck('conversation'), 'POST', '/messaging/conversations/direct', { userId: client.id });
    for (let message = 0; message < 24; message++) {
      const actor = message % 2 ? client : coach;
      const texts = ['How did the last session feel?','Good overall. The last set was challenging but controlled.','Thanks for logging your RPE. Keep the same load next time.','I slept better and feel ready for the next session.','I reviewed your progress. We will increase the load gradually.','I will add my measurements and weekly check-in today.'];
      await mutate(actor, ck(`message:${message}`), 'POST', `/messaging/conversations/${conversation.id}/messages`, { type: 'Text', body: `Demo · ${texts[message % texts.length]} (${Math.floor(message / 6) + 1})`, replyToMessageId: null, mediaIds: [] });
    }
    for (let e = 0; e < 6; e++) await mutate(coach, ck(`event:${e}`), 'POST', '/calendar/events', { kind: e % 2 ? 'Event' : 'Meeting', title: `Demo ${['Technique consultation','Progress review','Recovery planning'][e % 3]}`, description: 'Synthetic calendar entry.', timeZone: 'Europe/Warsaw', startsAtUtc: date(-14 + e * 5) + 'T15:00:00Z', endsAtUtc: date(-14 + e * 5) + 'T15:45:00Z', startDate: null, endDateExclusive: null, location: 'Demo training studio', meetingUrl: null, relationshipIds: [relationshipId], groupIds: [] });
    for (let s = 0; s < 3; s++) await mutate(coach, ck(`checkin:${s}`), 'POST', '/check-ins/schedules', { formTemplateId: forms[s + 1].id, name: `Demo ${['Weekly recovery','Readiness','Monthly progress'][s]} - ${client.name}`, description: 'Synthetic recurring check-in.', timeZone: 'Europe/Warsaw', recurrence: { kind: s === 2 ? 'Monthly' : 'EveryNDays', interval: s === 2 ? 1 : 7, startDate: date(-21), releaseTime: '07:00:00', ...(s === 2 ? { dayOfMonth: 1 } : {}) }, responseWindowHours: 168, relationshipIds: [relationshipId], groupIds: [] });
    console.log(`Collaboration ready: ${coach.username} / ${client.username}`);
  }
}

main().then(() => console.log(`Demo run complete: ${Object.keys(state.operations).length} persisted operations.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
