// Developer mock data for coaching, calendar and messaging (VITE_DEV_MOCKS=1 only). Clearly fake.
const uid = (): string => crypto.randomUUID();
const now = () => new Date().toISOString();
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

const COACH = "00000000-0000-4000-8000-0000000000c0";
let mockInvitationStatus = "Pending";
const OTHER_COACH = "00000000-0000-4000-8000-0000000000c2";
type MockShowcase = { hasCover: boolean; coachId: string; headline: string | null; yearsExperience: number | null; competencies: string[]; activeClients: number; clientsCoached: number; portfolio: { id: string; kind: string; title: string; description: string | null; contentType: string; size: number; createdAt: string }[]; version: number };
const showcases = new Map<string, MockShowcase>();
function showcaseOf(id: string, me: string): MockShowcase {
  let found = showcases.get(id);
  if (!found) {
    found = id === me
      ? { hasCover: false, coachId: id, headline: null, yearsExperience: null, competencies: [], activeClients: 3, clientsCoached: 5, portfolio: [], version: 0 }
      : {
          hasCover: false, coachId: id, headline: "Strength coach for runners and busy parents", yearsExperience: 8, competencies: ["Strength training", "Running economy", "Mobility", "Nutrition basics", "Return from injury"], activeClients: 14, clientsCoached: 61, version: 3,
          portfolio: [
            { id: "pf1", kind: "Certificate", title: "NSCA CSCS", description: "Certified Strength and Conditioning Specialist, 2019.", contentType: "image/png", size: 210000, createdAt: "2026-03-10T10:00:00Z" },
            { id: "pf2", kind: "ClientResult", title: "Half marathon in 1:39", description: "Anna went from 2:05 to 1:39 in 9 months with two strength sessions a week.", contentType: "image/jpeg", size: 380000, createdAt: "2026-06-02T10:00:00Z" },
            { id: "pf3", kind: "Certificate", title: "Precision Nutrition L1", description: null, contentType: "application/pdf", size: 120000, createdAt: "2026-04-21T10:00:00Z" },
          ],
        };
    showcases.set(id, found);
  }
  return found;
}
/** A small generated image standing in for an uploaded portfolio file. */
function portfolioImage(id: string) {
  const hue = [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${hue} 25% 22%)"/><text x="200" y="160" fill="hsl(${hue} 30% 70%)" font-family="sans-serif" font-size="22" text-anchor="middle">Portfolio file</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const people = [
  { id: "22222222-0000-4000-8000-000000000001", displayName: "Kazik Kowalski", username: "kazik_kowal" },
  { id: "22222222-0000-4000-8000-000000000002", displayName: "Anna Nowak", username: "anna.runs" },
  { id: "22222222-0000-4000-8000-000000000003", displayName: "Marta Wiśniewska", username: "marta_w" },
  { id: "22222222-0000-4000-8000-000000000004", displayName: "Piotr Zieliński", username: "pzielinski" },
];

const groups = [
  { id: "55555555-0000-4000-8000-000000000001", name: "Marathon block", description: "Spring marathon runners", color: "#79a8ff", archived: false, version: 1, createdAt: ago(40), updatedAt: ago(3), allowedActions: ["edit", "archive"] },
  { id: "55555555-0000-4000-8000-000000000002", name: "Strength beginners", description: "First 12 weeks in the gym", color: "#3ee09a", archived: false, version: 1, createdAt: ago(20), updatedAt: ago(1), allowedActions: ["edit", "archive"] },
];

const clients = people.map((client, i) => ({
  // Stable ids so client links survive a reload in mock mode.
  id: `33333333-0000-4000-8000-00000000000${i + 1}`,
  client,
  status: i === 3 ? "Suspended" : "Active",
  startedAt: ago(90 - i * 14),
  suspendedAt: null,
  resumedAt: null,
  completedAt: null,
  version: 1,
  updatedAt: ago(i + 1),
  groupIds: i < 2 ? [groups[0]!.id] : [groups[1]!.id],
  statusHistory: [],
  allowedActions: ["suspend", "complete"],
  clientPhone: null,
}));

const section = (title: string, labels: string[]) => ({
  key: uid(),
  title,
  order: 0,
  questions: labels.map((label, order) => ({ key: uid(), label, type: "ShortText", required: order === 0, order, helpText: order === 0 ? "A sentence or two is enough — your coach will ask follow-up questions." : null })),
});
const forms = [
  { id: uid(), coachId: COACH, purpose: "Application", name: "Online coaching intake", description: "Goals, training history and availability.", draft: { sections: [section("About you", ["Main goal", "Training history"])] }, currentPublishedVersionId: uid(), archived: false, createdAt: ago(30), updatedAt: ago(4), version: 3 },
  { id: uid(), coachId: COACH, purpose: "CheckIn", name: "Weekly check-in", description: "Sleep, energy, soreness and body weight.", draft: { sections: [section("This week", ["Sleep quality", "Energy", "Body weight"])] }, currentPublishedVersionId: uid(), archived: false, createdAt: ago(25), updatedAt: ago(2), version: 2 },
];

const offers: Record<string, unknown>[] = [
  // Developer data: one active offer with two ways to pay.
  { id: "offer-1", coachId: "00000000-0000-4000-8000-000000000000", name: "12-week online coaching", description: "A personal strength and running plan, weekly check-ins and a video call every month. For people who want structure and feedback without a gym coach next to them.", category: "online-coaching", coachingMode: "Online", applicationFormVersionId: "form-v1", tags: ["strength", "running"], status: "Active", currentPublishedRevisionId: "rev-1", createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-10-01T09:00:00Z", version: 3, teamId: null, teamName: null,
    billingOptions: [
      { id: "b1", name: "Monthly coaching", model: "PeriodSubscription", price: 349, minSessions: null, maxSessions: null, sessionCount: null, periodCount: 1, periodUnit: "Month", paymentTerms: { rule: "Upfront", offsetDays: null } },
      { id: "b2", name: "Technique sessions", model: "FixedPackage", price: 600, minSessions: null, maxSessions: null, sessionCount: 5, periodCount: null, periodUnit: null, paymentTerms: { rule: "OnStart", offsetDays: null } },
    ] },
];

const schedules = [
  {
    id: uid(), coachId: COACH, workspaceId: uid(), formTemplateId: forms[1]!.id, name: "Monday check-in", description: "", timeZone: "Europe/Warsaw",
    recurrence: { kind: "EveryNWeeks", interval: 1, startDate: day(-14), releaseTime: "09:00:00", weekDays: [1], dayOfMonth: null },
    responseWindowHours: 48, relationshipIds: [], groupIds: [groups[0]!.id], status: "Active", nextAvailableAtUtc: at(3, 9), retryAtUtc: null, lastFailure: null, failureCount: 0, version: 1, createdAt: ago(14), updatedAt: ago(14),
  },
];

const event = (kind: "Meeting" | "Event", title: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id: uid(), coachId: COACH, organizerName: "Demo Coach", kind, title, description: "", timeZone: "Europe/Warsaw", startsAtUtc: start, endsAtUtc: end,
  startDate: null, endDateExclusive: null, location: null, meetingUrl: null, cancelled: false, version: 1, response: null, responseVersion: null,
  attendees: [{ relationshipId: clients[0]!.id, clientId: people[0]!.id, response: "Accepted", version: 1 }], ...extra,
});
const events = [
  event("Meeting", "Kick-off call with Kazik", at(0, 10), at(0, 10, 45), { meetingUrl: "https://meet.example.test/kickoff" }),
  event("Meeting", "Technique review", at(2, 17), at(2, 18)),
  event("Event", "Club 10K race", at(5, 8), at(5, 12), { location: "City park" }),
  event("Meeting", "Monthly progress review", at(-3, 18), at(-3, 18, 30)),
  event("Event", "Deload week", at(9, 0), at(9, 0), { startDate: day(9), endDateExclusive: day(16) }),
  // A busy day: several all-day items and short meetings, to show how tight cells behave.
  event("Event", "Team offsite", at(1, 0), at(1, 0), { startDate: day(1), endDateExclusive: day(2) }),
  event("Event", "Nutrition workshop", at(1, 0), at(1, 0), { startDate: day(1), endDateExclusive: day(2) }),
  event("Event", "Travel day", at(1, 0), at(1, 0), { startDate: day(1), endDateExclusive: day(3) }),
  event("Meeting", "Quick form check with Marta", at(1, 8), at(1, 8, 15)),
  event("Meeting", "Short sync", at(1, 9), at(1, 9, 30)),
  event("Meeting", "Programme walkthrough with a long name", at(1, 13), at(1, 13, 45)),
];
const checkIns = [
  { id: uid(), kind: "Planned", scheduleId: schedules[0]!.id, requestId: null, name: "Monday check-in", availableAtUtc: at(3, 9), dueAtUtc: at(5, 9), status: "Planned" },
  { id: uid(), kind: "Request", scheduleId: schedules[0]!.id, requestId: uid(), name: "Monday check-in", availableAtUtc: at(-4, 9), dueAtUtc: at(-2, 9), status: "Reviewed" },
];

type Msg = { id: string; conversationId: string; senderUserId: string; type: string; body: string | null; replyToMessageId: null; createdAt: string; cursor: string; attachments: unknown[] };
const conversations = people.slice(0, 3).map((p, i) => ({
  id: uid(),
  type: "Direct",
  title: p.displayName,
  clientGroupId: null,
  membershipState: "Active",
  peer: p,
  unread: i === 1 ? 2 : 0,
}));
const groupChat = { id: uid(), type: "ClientGroupLinked", title: "Marathon block", clientGroupId: groups[0]!.id, membershipState: "Active", peer: null, unread: 0 };
const messages = new Map<string, Msg[]>();
const script: [boolean, string, number][] = [
  [false, "Hey, I've uploaded the new version of my week schedule.", 95],
  [true, "Great, I'll check it after lunch and let you know.", 90],
  [true, "Could we do a quick call today at 15:00?", 88],
  [false, "Sure. I also went through the last changes in the plan — the new long run day works much better for me, especially with the shorter Thursday session.", 80],
];
const SELF = "self";
for (const [i, c] of [...conversations, groupChat].entries()) {
  const list: Msg[] = (i === 0 ? script : i === 1 ? [[false, "Is tomorrow's tempo run still at 4:50/km?", 30] as [boolean, string, number], [false, "Legs feel fresh after the rest day.", 28] as [boolean, string, number]] : i === 2 ? [[true, "Welcome aboard! Fill in the intake form when you have a moment.", 3000] as [boolean, string, number]] : [[true, "Long run on Sunday: 24 km easy. Bring gels.", 600] as [boolean, string, number]]).map(([mine, body, minutes], n) => ({
    id: uid(), conversationId: c.id, senderUserId: mine ? SELF : (c.peer?.id ?? people[1]!.id), type: "Text", body, replyToMessageId: null, createdAt: new Date(Date.now() - minutes * 60_000).toISOString(), cursor: String(n), attachments: [],
  }));
  if (i === 0) {
    // A photo and a voice note from the client, so the chat shows both kinds of attachment.
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
    list.push(
      { id: uid(), conversationId: c.id, senderUserId: c.peer?.id ?? people[1]!.id, type: "Attachment", body: "Form check from today's session", replyToMessageId: null, createdAt: at(40), cursor: String(list.length), attachments: [{ mediaId: "mock-image", contentType: "image/png", size: 24576, durationMs: null }] },
      { id: uid(), conversationId: c.id, senderUserId: c.peer?.id ?? people[1]!.id, type: "VoiceMessage", body: null, replyToMessageId: null, createdAt: at(38), cursor: String(list.length + 1), attachments: [{ mediaId: "mock-voice", contentType: "audio/wav", size: 24044, durationMs: 1500 }] },
      // The coach's own photo, an invitation and an application form link: they render on the coach's side.
      { id: uid(), conversationId: c.id, senderUserId: SELF, type: "Attachment", body: null, replyToMessageId: null, createdAt: at(30), cursor: String(list.length + 2), attachments: [{ mediaId: "mock-image", contentType: "image/png", size: 24576, durationMs: null }] },
      { id: uid(), conversationId: c.id, senderUserId: SELF, type: "Text", body: "Coaching invitation: 12-week online coaching\n/app/invitations/66666666-0000-4000-8000-000000000001", replyToMessageId: null, createdAt: at(20), cursor: String(list.length + 3), attachments: [] },
      { id: uid(), conversationId: c.id, senderUserId: SELF, type: "Text", body: "Application form: 12-week online coaching\n/app/coaches/00000000-0000-4000-8000-0000000000c0/offers/77777777-0000-4000-8000-000000000001", replyToMessageId: null, createdAt: at(19), cursor: String(list.length + 4), attachments: [] },
    );
  }
  messages.set(c.id, list);
}

// Older chats, so the conversation list has more than one batch to scroll through.
const archiveNames = ["Ola Lewandowska", "Tomek Kamiński", "Ewa Zając", "Bartek Szymański", "Kasia Woźniak", "Michał Dąbrowski", "Natalia Kozłowska", "Jakub Mazur", "Zuza Krawczyk", "Filip Piotrowski", "Ania Grabowska", "Kuba Nowicki", "Ida Pawłowska", "Adam Michalski", "Lena Król", "Szymon Wieczorek", "Maja Jabłońska", "Oskar Wróbel", "Hania Majewska", "Igor Olszewski", "Julia Stępień", "Wiktor Malinowski", "Zosia Jaworska", "Leon Adamczyk", "Nina Dudek", "Antek Nowakowski", "Pola Pawlak", "Kacper Górski", "Iga Witkowska", "Borys Walczak"];
const archive = archiveNames.map((displayName, i) => {
  const peer = { id: `22222222-0000-4000-8000-1${String(i).padStart(11, "0")}`, displayName, username: displayName.toLowerCase().split(" ")[0]! + i };
  const c = { id: uid(), type: "Direct", title: displayName, clientGroupId: null, membershipState: "Active", peer, unread: 0 };
  messages.set(c.id, [{ id: uid(), conversationId: c.id, senderUserId: i % 2 ? SELF : peer.id, type: "Text", body: i % 2 ? "Plan for next week is up. Let me know how the first session feels." : "Thanks, see you next week!", replyToMessageId: null, createdAt: new Date(Date.now() - (2 + i) * 86_400_000).toISOString(), cursor: "0", attachments: [] }]);
  return c;
});

const resolve = (me: string) => (m: Msg) => (m.senderUserId === SELF ? { ...m, senderUserId: me } : m);
const member = (userId: string, displayName: string, role = "Member") => ({ userId, displayName, role, source: "Direct", state: "Active", excluded: false, joinedAt: ago(30), removedAt: null, lastReadMessageId: null });
function conversationDto(c: (typeof conversations)[number] | typeof groupChat, me: string) {
  const list = messages.get(c.id) ?? [];
  const last = list.at(-1);
  const members = c.peer ? [member(me, "Demo Coach", "Owner"), member(c.peer.id, c.peer.displayName)] : [member(me, "Demo Coach", "Owner"), member(people[0]!.id, people[0]!.displayName), member(people[1]!.id, people[1]!.displayName)];
  return { id: c.id, type: c.type, title: c.title, clientGroupId: c.clientGroupId, membershipState: c.membershipState, lastMessage: last ? resolve(me)(last) : null, unreadCount: c.unread, members };
}

const page = <T>(items: T[], q: URLSearchParams) => {
  const p = Number(q.get("page") ?? 1);
  const s = Number(q.get("pageSize") ?? 25);
  return { items: items.slice((p - 1) * s, p * s), total: items.length, page: p, pageSize: s };
};
const search = <T extends { name?: string; title?: string }>(items: T[], q: URLSearchParams) => {
  const term = q.get("search")?.toLowerCase();
  return term ? items.filter((x) => (x.name ?? x.title ?? "").toLowerCase().includes(term)) : items;
};
const messagingPreferences = { requireApproval: false };
const profileFields: { currency: string; values: Record<string, unknown>; version: number } = { currency: "PLN", values: { Sex: "Male", Height: 182, Weight: 84.5, HrMax: 188, SessionsPerWeek: 4, PreferredTrainingDays: [1, 3, 5] }, version: 1 };

// Mirrors the server catalog: personal (Free, Starter, Pro) and workspace (Team, Studio) ladders with their tiers.
const professional = ["training.builder.advanced", "training.export.pdf", "training.export.csv", "training.import.csv", "training.formulas.custom", "training.sets.advanced", "exercises.custom.create", "video.analysis.cloud", "analytics.advanced", "automation.advanced", "discovery.ranking.priority", "integrations.mcp.write-training-drafts"];
const planLimits = (seats: number, clients: number, runs: number, local: number | null, gpu: number) => ({
  "coaching.active_clients": clients, "organization.coach_seats": seats, "training.generator.runs_per_period": runs, "video.local_analyses_per_period": local, "video.cloud_gpu_seconds_per_period": gpu,
});
const platformPlans = [
  { id: "Free", amount: 0, scope: "Account", tier: 1, top: 3, commission: 0.1, caps: [] as string[], limits: planLimits(1, 3, 3, 2, 0) },
  { id: "Starter", amount: 9, scope: "Account", tier: 2, top: 3, commission: 0.1, caps: [] as string[], limits: planLimits(1, 8, 15, 5, 0) },
  { id: "Pro", amount: 24, scope: "Account", tier: 3, top: 3, commission: 0.1, caps: professional, limits: planLimits(1, 60, 500, null, 7200) },
  { id: "Team", amount: 69, scope: "Workspace", tier: 1, top: 2, commission: 0.1, caps: [...professional, "organization.workspace.manage"], limits: planLimits(3, 200, 2000, null, 30000) },
  { id: "Studio", amount: 159, scope: "Workspace", tier: 2, top: 2, commission: 0.1, caps: [...professional, "organization.workspace.manage"], limits: planLimits(10, 600, 5000, null, 90000) },
].map((plan) => ({
  id: plan.id,
  name: plan.id,
  amount: plan.amount,
  currency: "EUR",
  billingInterval: "Month",
  priceVersion: "eur-monthly-v3",
  termsVersion: "2026-10",
  commissionRate: plan.commission,
  priceConfigured: true,
  capabilities: plan.caps,
  limits: plan.limits,
  simulated: true,
  priceScope: plan.scope,
  upgradePolicy: "Immediate new monthly period; no proration",
  tier: plan.tier,
  topTier: plan.top,
}));
/** Discovery: the coach's own listing and a page of coaches, two of them featured (Pro and above). */
const discoveryListing = { published: true, specializations: ["Strength", "Powerlifting"], languages: ["pl", "en"], modes: ["Online", "Hybrid"], location: "Warszawa", version: 1 };
const discoveryCoaches = [
  { name: "Ola Trener", user: "ola.coach", bio: "Strength and powerlifting coach. I help lifters reach their first meet with a clear plan and weekly video feedback.", tags: ["Strength", "Powerlifting"], langs: ["pl", "en"], modes: ["Online", "Hybrid"], location: "Warszawa", featured: true, offer: ["12-week meet prep", 349] },
  { name: "Marek Lis", user: "marek.runs", bio: "Running coach for 10K to marathon. Structured plans built around your week.", tags: ["Running", "Endurance"], langs: ["pl"], modes: ["Online"], location: "Kraków", featured: true, offer: ["Marathon block", 249] },
  { name: "Kasia Nowak", user: "kasia.moves", bio: "Mobility and general fitness for busy people.", tags: ["Mobility", "Fitness"], langs: ["pl", "en"], modes: ["Offline"], location: "Gdańsk", featured: false, offer: ["Monthly coaching", 199] },
  { name: "Tom Becker", user: "tom.lifts", bio: "Hypertrophy and body recomposition, evidence-based.", tags: ["Hypertrophy"], langs: ["en", "de"], modes: ["Online"], location: "Berlin", featured: false, offer: null },
  { name: "Ania Wójcik", user: "ania.fit", bio: null, tags: ["Pre- and postnatal"], langs: ["pl"], modes: ["Hybrid"], location: "Poznań", featured: false, offer: ["Postnatal return", 179] },
].map((c, i) => ({ coachId: `99999999-0000-4000-8000-00000000000${i + 1}`, username: c.user, displayName: c.name, bio: c.bio, specializations: c.tags, languages: c.langs, modes: c.modes, location: c.location, featured: c.featured, offer: c.offer ? { offerId: `99999999-1111-4000-8000-00000000000${i + 1}`, coachId: `99999999-0000-4000-8000-00000000000${i + 1}`, name: c.offer[0], currency: "PLN", minimumPrice: c.offer[1], mode: c.modes[0], category: c.tags[0] } : null }));
const platformSubscription = { id: uid(), planId: "Free", status: "Active", periodStart: null, periodEnd: null, nextDueAt: null, autoRenew: false, renewalMethodEligible: false, pendingPlanId: null, version: 1, pendingDue: null, acceptedPriceVersion: null, acceptedTermsVersion: null };

/** Deterministic but lively fake analytics for the requested window. */
function analyzeOverview(q: URLSearchParams) {
  const to = new Date(q.get("to") ?? day(0));
  const from = new Date(q.get("from") ?? day(-29));
  const grouping = q.get("grouping") ?? "day";
  const step = grouping === "month" ? 30 : grouping === "week" ? 7 : 1;
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const count = Math.max(1, Math.ceil(days / step));
  const wave = (i: number, seed: number) => Math.abs(Math.sin(i * 0.7 + seed) + Math.sin(i * 0.23 + seed * 2)) / 2;
  const dates = Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i * step);
    return d.toLocaleDateString("en-CA");
  });
  const build = (seed: number) => {
    const series = dates.map((date, i) => {
      const gross = Math.round((180 + i * 9 + wave(i, seed) * 420) * step);
      return { date, currency: "PLN", gross, fee: Math.round(gross * 0.05), net: Math.round(gross * 0.95), payments: Math.max(1, Math.round(gross / 160)) };
    });
    const gross = series.reduce((s, x) => s + x.gross, 0);
    const payments = series.reduce((s, x) => s + x.payments, 0);
    const clients = dates.map((date, i) => ({ date, active: 14 + Math.round(i * (seed ? 0.25 : 0.18) + wave(i, seed) * 3), newClients: Math.round(wave(i, seed + 1) * 2), reactivated: i % 9 === 0 ? 1 : 0, departed: i % 11 === 4 ? 1 : 0 }));
    const checkIns = dates.map((date, i) => {
      const issued = Math.round((6 + wave(i, seed + 3) * 8) * step);
      const submitted = Math.round(issued * (0.72 + wave(i, seed + 5) * 0.25));
      return { date, issued, submitted, overdue: issued - submitted };
    });
    const issued = checkIns.reduce((s, x) => s + x.issued, 0);
    const submitted = checkIns.reduce((s, x) => s + x.submitted, 0);
    const active = clients.at(-1)!.active;
    return {
      finance: {
        totals: [{ currency: "PLN", gross, fee: Math.round(gross * 0.05), net: Math.round(gross * 0.95), pending: Math.round(gross * 0.12), payments, payingClients: Math.round(active * 0.8), averagePayment: Math.round(gross / payments), revenuePerPayingClient: Math.round(gross / (active * 0.8)), mrr: Math.round(active * 0.6 * 320), recurringSubscriptions: Math.round(active * 0.6), renewals: Math.round(payments * 0.4), simulatedGross: Math.round(gross * 0.7), externalGross: Math.round(gross * 0.3) }],
        series,
        offers: [
          { offerRevisionId: "o1", name: "Online coaching", currency: "PLN", gross: Math.round(gross * 0.52), net: Math.round(gross * 0.49), payments: Math.round(payments * 0.5), clients: 9 },
          { offerRevisionId: "o2", name: "Strength block", currency: "PLN", gross: Math.round(gross * 0.31), net: Math.round(gross * 0.29), payments: Math.round(payments * 0.3), clients: 6 },
          { offerRevisionId: "o3", name: "Running plan", currency: "PLN", gross: Math.round(gross * 0.17), net: Math.round(gross * 0.16), payments: Math.round(payments * 0.2), clients: 4 },
        ],
      },
      clients: {
        active,
        suspended: 2,
        completed: 5,
        newClients: clients.reduce((s, x) => s + x.newClients, 0),
        reactivated: clients.reduce((s, x) => s + x.reactivated, 0),
        departed: clients.reduce((s, x) => s + x.departed, 0),
        netGrowth: active - clients[0]!.active,
        retentionPercent: seed ? 91 : 86,
        series: clients,
        groups: groups.map((g, i) => ({ id: g.id, name: g.name, clients: 3 + i * 2 })),
      },
      acquisition: {
        submitted: seed ? 24 : 19,
        accepted: seed ? 15 : 11,
        rejected: 4,
        conversionPercent: seed ? 62.5 : 57.9,
        invitationsSent: 12,
        invitationsAccepted: 8,
        invitationsDeclined: 2,
        sources: [
          { source: "Public offer", submitted: 12, accepted: 8, rejected: 2, pending: 2, conversionPercent: 66.7 },
          { source: "Coach profile", submitted: 7, accepted: 4, rejected: 1, pending: 2, conversionPercent: 57.1 },
          { source: "Direct link", submitted: 5, accepted: 3, rejected: 1, pending: 1, conversionPercent: 60 },
        ],
      },
      checkIns: { issued, submitted, overdue: issued - submitted, pendingReview: Math.round(submitted * 0.15), submissionRate: Math.round((submitted / issued) * 1000) / 10, averageReviewHours: seed ? 7.4 : 9.1, series: checkIns },
    };
  };
  const current = build(1);
  const previous = build(0);
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  return {
    period: { from: iso(from), to: iso(to), timeZone: q.get("timeZone") ?? "UTC", start: from.toISOString(), end: to.toISOString() },
    comparisonPeriod: { from: iso(new Date(from.getTime() - days * 86_400_000)), to: iso(new Date(from.getTime() - 86_400_000)), timeZone: "UTC", start: "", end: "" },
    finance: current.finance,
    previousFinance: previous.finance,
    clients: current.clients,
    previousClients: previous.clients,
    acquisition: current.acquisition,
    previousAcquisition: previous.acquisition,
    checkIns: current.checkIns,
    previousCheckIns: previous.checkIns,
    training: { available: true, reason: "", progress: mockTrainingProgress(iso(from), iso(to)) },
    messaging: { sent: 128, received: 141, conversations: 11 },
    filters: { groups: groups.map((g) => ({ id: g.id, name: g.name, clients: 4 })), offers: [{ id: "o1", name: "Online coaching" }, { id: "o2", name: "Strength block" }] },
  };
}

/** Developer data for the Analyze training tab: three lifts trending up, a handful of clients. */
function mockTrainingProgress(from: string, to: string) {
  const day = (i: number) => new Date(Date.parse(`${to}T00:00:00Z`) - i * 7 * 86400000).toISOString().slice(0, 10);
  const lift = (exerciseId: string, name: string, start: number, step: number) =>
    [4, 3, 2, 1, 0].map((w, k) => ({ exerciseId, name, performedDate: day(w), loadMeaning: "absolute", sets: 4 + (k % 2), reps: 20 - k, volumeKg: (start + k * step) * (20 - k), bestLoadKg: start + k * step, averageRpe: 7.5 + k * 0.2, averageRir: 2, substitutionSets: k === 2 ? 1 : 0 }));
  return {
    from, to, planned: 96, due: 84, completed: 69, skipped: 5, missed: 10, inProgress: 3, completionPercentage: 82, loggedLate: 8, activeAssignments: 14,
    actualSets: 1186, actualReps: 6420, volumeKg: 412800,
    programs: [{ programId: "p1", programName: "Strength block A", completed: 31 }, { programId: "p2", programName: "Hypertrophy 10-day", completed: 22 }, { programId: "p3", programName: "Return to run", completed: 16 }],
    clients: [
      { relationshipId: "r1", due: 12, completed: 12, missed: 0, latestCompletedAt: `${day(0)}T07:30:00Z` },
      { relationshipId: "r2", due: 12, completed: 9, missed: 2, latestCompletedAt: `${day(1)}T18:10:00Z` },
      { relationshipId: "r3", due: 10, completed: 5, missed: 4, latestCompletedAt: `${day(2)}T06:45:00Z` },
      { relationshipId: "r4", due: 8, completed: 8, missed: 0, latestCompletedAt: `${day(0)}T12:00:00Z` },
    ],
    performance: [...lift("e1", "Back squat", 120, 2.5), ...lift("e2", "Bench press", 85, 1.25), ...lift("e3", "Romanian deadlift", 110, 5)],
    metricDefinition: "Completion counts workouts due in the period that were logged as completed. Loads come only from logged sets.",
  };
}

const mockNotifications: Array<{ id: string; type: string; category: string; sourceModule: string; sourceId: string; deepLink: string | null; createdAt: string; readAt: string | null }> = [
  { id: "n1", type: "MessageCreated", category: "Messaging", sourceModule: "Messaging", sourceId: "c1", deepLink: "/app/messages", createdAt: new Date(Date.now() - 6 * 60_000).toISOString(), readAt: null },
  { id: "n2", type: "CheckInSubmitted", category: "CheckIns", sourceModule: "CheckIns", sourceId: "k1", deepLink: "/app/check-ins", createdAt: new Date(Date.now() - 52 * 60_000).toISOString(), readAt: null },
  { id: "n3", type: "ApplicationSubmitted", category: "Coaching", sourceModule: "Coaching", sourceId: "a1", deepLink: "/app/leads", createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(), readAt: new Date().toISOString() },
  // Older, already read items so the panel has enough to scroll.
  ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i + 4}`, type: i % 2 ? "CheckInSubmitted" : "MessageCreated", category: i % 2 ? "CheckIns" : "Messaging", sourceModule: i % 2 ? "CheckIns" : "Messaging", sourceId: `old${i}`, deepLink: i % 2 ? "/app/check-ins" : "/app/messages", createdAt: new Date(Date.now() - (i + 2) * 86_400_000).toISOString(), readAt: new Date().toISOString() })),
];

let mockTeamInviteOpen = true;

/** Returns a response for the coaching, calendar and messaging endpoints, or null when the path isn't one of them. */

// AI integrations: one active and one waiting connection, recent history and a message to approve.
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const aiConnections = [
  { id: "ai-conn-1", clientId: "chatgpt-6f2c1a", clientName: "ChatGPT", grants: ["read_training", "write_training_drafts", "read_clients", "prepare_messages"], createdAt: hoursAgo(24 * 12), lastUsedAt: hoursAgo(2), revokedAt: null as string | null, version: 3 },
  { id: "ai-conn-2", clientId: "claude-connector-91ab", clientName: "Claude", grants: [] as string[], createdAt: hoursAgo(24 * 3), lastUsedAt: null as string | null, revokedAt: null as string | null, version: 1 },
];
const aiActions = [
  { id: "ai-action-1", connectionId: "ai-conn-1", clientName: "ChatGPT", type: "SendMessage", status: "Pending", conversationId: "conv-1", conversationTitle: "Plan na listopad", recipients: [{ userId: "u-1", displayName: "Anna Kowalska" }], body: "Hej Anna, nowy plan jest gotowy.", payloadHash: "x", createdAt: hoursAgo(1), expiresAt: hoursAgo(-23), approvedAt: null },
];
const aiOps = ["create_program_draft", "update_program_draft", "prepare_message", "create_checkin_draft"];
const aiActivity = Array.from({ length: 14 }, (_, n) => ({ connectionId: "ai-conn-1", clientName: "ChatGPT", operation: aiOps[n % aiOps.length], status: n === 3 ? "Rejected" : n === 0 ? "Pending" : "Executed", at: hoursAgo(2 + n * 7), actionId: n === 0 ? "ai-action-1" : null, resultId: null }));
const aiPreferences = { note: "", shareWithIntegrations: false, version: 1 };

export function mockCoaching(path: string, method: string, q: URLSearchParams, body: Record<string, unknown> | undefined, auth: string | null): { status: number; body: unknown } | null {
  const me = `00000000-0000-4000-8000-00000000000${(auth ?? "").replace(/^Bearer mock-/, "") || "0"}`;
  const ok = (value: unknown) => ({ status: 200, body: value });
  let m: RegExpMatchArray | null;

  // Team (developer data): one Team the demo coach owns, with two members.
  const team = { id: "t1", name: "North Strength Collective", isOwner: true, isMember: true, members: 3, role: "Owner", status: "Active", description: "Strength and conditioning coaches in Gdańsk.", version: 1, purchasedSeats: 5, occupiedSeats: 3, periodEnd: null, dissolutionAt: null, allowedActions: ["teams.invite", "teams.manage", "teams.clients", "teams.analyze", "teams.settings", "teams.transfer-ownership"], pendingOwnerId: null };
  if (path === "/api/v1/accounts/people" || path === "/api/v1/messaging/people") {
    const prefix = (q.get("search") ?? "").trim().replace(/^@/, "").toLowerCase();
    return ok(prefix.length < 2 ? [] : [...people, { id: OTHER_COACH, displayName: "Ola Zielińska", username: "ola.trains" }].filter(person => person.username.toLowerCase().startsWith(prefix)).map(person => ({ userId: person.id, username: person.username, displayName: person.displayName })));
  }
  // Leads (developer data): three applications to the demo coach's offers.
  if (path === "/api/v1/coaching/leads" && method === "GET") {
    const lead = (i: number, displayName: string, username: string, offerName: string, status: string, amount: number, days: number) => ({ id: `77777777-0000-4000-8000-00000000000${i}`, coachId: COACH, applicantUserId: `77777777-1000-4000-8000-00000000000${i}`, applicant: { id: `77777777-1000-4000-8000-00000000000${i}`, displayName, username }, offerName, offerRevisionId: uid(), billingOptionId: uid(), selectedSessionCount: null, amount, currency: "PLN", source: "Direct", invitationId: null, status, submittedAt: ago(days), decidedAt: null, createdAt: ago(days + 1), updatedAt: ago(days), version: 1, relationshipId: null, serviceId: null, allowedActions: [], offerCategory: null });
    const leads = [lead(1, "Natalia Kaczmarek", "natalia.k", "12-week online coaching", "Submitted", 450, 1), lead(2, "Michał Wójcik", "mwojcik", "Technique review", "Submitted", 249, 3), lead(3, "Zofia Lewandowska", "zofia.runs", "Meet prep · Monthly", "Accepted", 349, 9)];
    return ok(page(leads.filter((l) => !q.get("status") || l.status === q.get("status")), q));
  }
  // An invitation to another Team waits for the demo coach's answer until it is accepted or declined.
  if ((m = path.match(/^\/api\/v1\/teams\/requests\/([^/]+)\/decision$/)) && method === "POST") { mockTeamInviteOpen = false; return { status: 204, body: undefined }; }
  if (path === "/api/v1/teams/mine") return ok({ teams: [team], requests: [
    { id: "tr1", teamId: "t1", teamName: team.name, displayName: "Ola Zielińska", kind: "Invite", status: "Pending", canDecide: false, role: "Member", expiresAt: new Date(Date.now() + 5 * 86400000).toISOString() },
    ...(mockTeamInviteOpen ? [{ id: "tr2", teamId: "t2", teamName: "Baltic Endurance Lab", displayName: "Demo Coach", kind: "Invite", status: "Pending", canDecide: true, role: "Member", expiresAt: new Date(Date.now() + 6 * 86400000).toISOString() }] : []),
  ] });
  if (path === "/api/v1/teams/t1/members") return ok([
    { userId: me, displayName: "Demo Coach", username: "demo.coach", role: "Owner", joinedAt: "2026-03-01T09:00:00Z" },
    { userId: "u2", displayName: "Tomasz Lis", username: "tomasz.lis", role: "Admin", joinedAt: "2026-04-12T09:00:00Z" },
    { userId: "u3", displayName: "Ewa Maj", username: "ewa.maj", role: "Member", joinedAt: "2026-07-20T09:00:00Z" },
  ]);
  if (path === "/api/v1/teams/t1/clients") return ok([{ id: "tc1", teamId: "t1", clientId: "c9", clientName: "Bartek Nowicki", status: "Active", assignedCoachIds: ["u2"], relationshipId: null, allowedActions: ["assign-coach"], version: 1 }]);
  if (path === "/api/v1/teams/t1/client-transfer-requests") return ok([]);
  // Notifications (developer data): two unread, one read.
  if (path === "/api/v1/me/notifications/unread-count") return ok({ count: mockNotifications.filter((n) => !n.readAt).length });
  if (path === "/api/v1/me/notifications/read-all" && method === "POST") { mockNotifications.forEach((n) => { n.readAt ??= now(); }); return { status: 204, body: undefined }; }
  if ((m = path.match(/^\/api\/v1\/me\/notifications\/([^/]+)\/read$/)) && method === "POST") { const n = mockNotifications.find((x) => x.id === m![1]); if (n) n.readAt ??= now(); return { status: 204, body: undefined }; }
  if (path === "/api/v1/me/notifications") {
    const items = q.get("unreadOnly") === "true" ? mockNotifications.filter((n) => !n.readAt) : mockNotifications;
    return ok({ items, page: 1, pageSize: 25, total: items.length });
  }
  if (path === "/api/v1/me/notification-preferences") {
    if (method === "PATCH") mockPreferences = { ...mockPreferences, ...(body as object) };
    return ok(mockPreferences);
  }
  if (path === "/api/v1/coaching/clients" && method === "GET") {
    const term = q.get("search")?.toLowerCase();
    return ok(page(clients.filter((c) => (!q.get("status") || c.status === q.get("status")) && (!term || c.client.displayName.toLowerCase().includes(term))), q));
  }
  if ((m = path.match(/^\/api\/v1\/coaching\/clients\/([^/]+)$/))) return ok(clients.find((c) => c.id === m![1]));
  if (path === "/api/v1/coaching/groups" && method === "GET") return ok(page(search(groups.filter((g) => g.archived === (q.get("archived") === "true")), q), q));
  if (path === "/api/v1/coaching/groups" && method === "POST") {
    const group = { ...groups[0]!, id: uid(), ...body, archived: false, version: 1, createdAt: now(), updatedAt: now() } as (typeof groups)[number];
    groups.push(group);
    return ok(group);
  }
  if ((m = path.match(/^\/api\/v1\/coaching\/groups\/([^/]+)$/))) {
    const group = groups.find((g) => g.id === m![1]);
    if (group && method === "PATCH") Object.assign(group, body, { version: group.version + 1, updatedAt: now() });
    return ok(group);
  }
  if ((m = path.match(/^\/api\/v1\/coaching\/groups\/([^/]+)\/members$/))) return ok(page(clients.filter((c) => c.groupIds.includes(m![1]!)), q));
  if (path === "/api/v1/forms/summaries" && method === "GET") return ok(page(search(forms.filter((f) => !q.get("purpose") || f.purpose === q.get("purpose")), q).map(({ draft, ...form }) => ({ ...form, questionCount: draft.sections.reduce((sum, section) => sum + section.questions.length, 0), estimatedSeconds: draft.sections.reduce((sum, section) => sum + section.questions.reduce((s, question) => s + ({ YesNo: 4, Scale: 5, SingleChoice: 6, Number: 7, Date: 7, MultiChoice: 9, ShortText: 12, LongText: 40, FileAttachment: 25 } as Record<string, number>)[String(question.type)]!, 0), 0) })), q));
  if (path === "/api/v1/forms" && method === "GET") return ok(page(search(forms.filter((f) => !q.get("purpose") || f.purpose === q.get("purpose")), q), q));
  if ((m = path.match(/^\/api\/v1\/forms\/([^/]+)$/)) && method === "GET") return ok(forms.find((f) => f.id === m![1]));
  if (path === "/api/v1/offers" && method === "GET") return ok(page(offers, q));
  if (path === "/api/v1/offers" && method === "POST") {
    const offer = { id: uid(), coachId: COACH, status: "Draft", currentPublishedRevisionId: null, createdAt: now(), updatedAt: now(), version: 1, ...body };
    offers.push(offer);
    return ok(offer);
  }
  if ((m = path.match(/^\/api\/v1\/offers\/([^/]+)$/)) && m[1] !== "categories") return ok(offers.find((o) => o.id === m![1]));
  if (path === "/api/v1/offers/categories") return ok([{ key: "online-coaching", name: "Online coaching", active: true }, { key: "running", name: "Running", active: true }, { key: "strength", name: "Strength training", active: true }]);
  if (path === "/api/v1/me/profile-fields" && method === "PATCH") {
    // Merge like the API: null removes a value.
    const values = { ...profileFields.values };
    for (const [key, value] of Object.entries((body?.values ?? {}) as Record<string, unknown>)) {
      if (value === null) delete values[key];
      else values[key] = value;
    }
    profileFields.values = values;
    profileFields.version++;
    return ok(profileFields);
  }
  if (path === "/api/v1/me/profile-fields") return ok(profileFields);
  if (path === "/api/v1/me/messaging-preferences") {
    if (method === "PUT") messagingPreferences.requireApproval = Boolean(body?.requireApproval);
    return ok(messagingPreferences);
  }
  // Coach showcases: the demo coach's own (editable) and one other coach to look at.
  if ((m = path.match(/^\/api\/v1\/coaches\/([^/]+)\/showcase$/)) && method === "GET") return ok(showcaseOf(m[1]!, me));
  if (path === "/api/v1/me/coach-showcase" && method === "PUT") {
    const current = showcaseOf(me, me);
    Object.assign(current, { headline: body?.headline ?? null, yearsExperience: body?.yearsExperience ?? null, competencies: body?.competencies ?? [], version: current.version + 1 });
    return ok(current);
  }
  if ((m = path.match(/^\/api\/v1\/me\/coach-showcase\/portfolio\/([^/]+)$/)) && method === "DELETE") {
    const current = showcaseOf(me, me);
    current.portfolio = current.portfolio.filter((item) => item.id !== m![1]);
    return { status: 204, body: null };
  }
  if ((m = path.match(/^\/api\/v1\/coaches\/[^/]+\/showcase\/portfolio\/([^/]+)\/read-url$/))) return ok({ url: portfolioImage(m[1]!), expiresAt: at(1, 0) });
  if ((m = path.match(/^\/api\/v1\/coaches\/([^/]+)\/showcase\/cover\/read-url$/))) return showcaseOf(m[1]!, me).hasCover ? ok({ url: portfolioImage("cover-" + m[1]!), expiresAt: at(1, 0) }) : { status: 404, body: { status: 404, title: "RESOURCE_NOT_FOUND", code: "RESOURCE_NOT_FOUND" } };
  if (path === "/api/v1/me/coach-showcase/cover" && method === "DELETE") {
    const current = showcaseOf(me, me);
    current.hasCover = false;
    current.version++;
    return ok(current);
  }
  if ((m = path.match(/^\/api\/v1\/accounts\/people\/([^/]+)$/))) {
    const name = decodeURIComponent(m[1]!).replace(/^@/, "").toLowerCase();
    if (name === "demo_coach" || name === "demo.coach") return ok({ userId: me, username: "demo_coach", displayName: "Demo Coach", bio: null, roles: ["Coach"], isSelf: true, memberSince: new Date(Date.now() - 10 * 86_400_000).toISOString() }); // a new account, so first-run tips show
    if (name === "ola.trains") return ok({ userId: OTHER_COACH, username: "ola.trains", displayName: "Ola Zielińska", bio: "Strength and conditioning coach in Gdańsk. I help runners and busy parents get strong without living in the gym.", roles: ["Coach"], isSelf: false, memberSince: "2026-03-04T10:00:00Z" });
    const person = people.find((p) => p.username.toLowerCase() === name);
    return person
      ? ok({ userId: person.id, username: person.username, displayName: person.displayName, bio: "Training for my first half marathon. Lifting three times a week.", roles: ["Client"], isSelf: false })
      : { status: 404, body: { status: 404, title: "RESOURCE_NOT_FOUND", code: "RESOURCE_NOT_FOUND" } };
  }
  if (path === "/api/v1/me/currency" && method === "PATCH") {
    profileFields.currency = String(body?.currency ?? profileFields.currency);
    profileFields.version++;
    return ok(profileFields);
  }
  if (path === "/api/v1/check-ins/schedules" && method === "GET") return ok(page(search(schedules, q), q));
  if (path === "/api/v1/check-ins/schedules" && method === "POST") {
    const schedule = { ...schedules[0]!, id: uid(), ...body, status: "Active", version: 1 } as (typeof schedules)[number];
    schedules.push(schedule);
    return ok(schedule);
  }
  if ((m = path.match(/^\/api\/v1\/check-ins\/schedules\/([^/]+)$/))) return ok(schedules.find((s) => s.id === m![1]));
  if (path === "/api/v1/check-ins/calendar") return ok(page(checkIns.filter((c) => !q.get("kind") || c.kind === q.get("kind")), q));
  if (path === "/api/v1/calendar/events" && method === "GET") return ok(page(events, q));
  if (path === "/api/v1/calendar/events" && method === "POST") {
    const created = event((body?.kind as "Meeting") ?? "Meeting", String(body?.title ?? ""), String(body?.startsAtUtc ?? now()), String(body?.endsAtUtc ?? now()), { ...body, attendees: [] });
    events.push(created);
    return ok(created);
  }
  if ((m = path.match(/^\/api\/v1\/calendar\/events\/([^/]+)\/(cancel|restore)$/)) && method === "POST") {
    const found = events.find((e) => e.id === m![1]);
    if (found) Object.assign(found, { cancelled: m[2] === "cancel", version: found.version + 1 });
    return ok(found);
  }
  if ((m = path.match(/^\/api\/v1\/calendar\/events\/([^/]+)$/))) {
    const found = events.find((e) => e.id === m![1]);
    if (found && method === "PATCH") Object.assign(found, body, { version: found.version + 1 });
    return ok(found);
  }

  if (path === "/api/v1/messaging/conversations" && method === "GET") {
    // Pages like the API: `limit` per page, `page` from 1.
    const limit = Math.min(100, Number(q.get("limit") ?? 25));
    const page = Math.max(1, Number(q.get("page") ?? 1));
    return ok(search([...conversations, groupChat, ...archive], q).slice((page - 1) * limit, page * limit).map((c) => conversationDto(c as typeof conversations[number], me)));
  }
  if ((m = path.match(/^\/api\/v1\/messaging\/conversations\/([^/]+)$/))) {
    const c = [...conversations, groupChat, ...archive].find((x) => x.id === m![1]);
    return c ? ok(conversationDto(c, me)) : null;
  }
  if ((m = path.match(/^\/api\/v1\/messaging\/conversations\/([^/]+)\/messages$/))) {
    const list = messages.get(m[1]!) ?? [];
    if (method === "POST") {
      const sent: Msg = { id: uid(), conversationId: m[1]!, senderUserId: SELF, type: "Text", body: (body?.body as string) ?? null, replyToMessageId: null, createdAt: now(), cursor: String(list.length), attachments: [] };
      list.push(sent);
      messages.set(m[1]!, list);
      return ok(resolve(me)(sent));
    }
    return ok({ items: list.map(resolve(me)), olderCursor: null, newerCursor: null });
  }
  if ((m = path.match(/^\/api\/v1\/messaging\/conversations\/([^/]+)\/read$/))) {
    const c = conversations.find((x) => x.id === m![1]);
    if (c) c.unread = 0;
    return { status: 204, body: undefined };
  }
  if (path === "/api/v1/messaging/requests") return ok([]);
  if (path === "/api/v1/me/blocked-users") return ok([]);
  if (path === "/api/v1/analyze/overview") return ok(analyzeOverview(q));
  // Basic Analyze (free plan): counts and payments in one go, two currencies to show both cards.
  if (path === "/api/v1/analyze/basic") {
    const o = analyzeOverview(q);
    const t = o.finance.totals[0]!;
    const eur = { ...t, currency: "EUR", gross: Math.round(t.gross / 4.3), fee: Math.round(t.fee / 4.3), net: Math.round(t.net / 4.3), pending: 0, payments: Math.round(t.payments / 4) };
    return ok({ period: o.period, clients: { active: o.clients.active, suspended: o.clients.suspended, completed: o.clients.completed }, checkIns: o.checkIns, messaging: o.messaging, simulatedPayments: true,
      finance: { totals: [t, eur], series: [...o.finance.series, ...o.finance.series.map((p) => ({ ...p, currency: "EUR", gross: Math.round(p.gross / 4.3), net: Math.round(p.net / 4.3), fee: Math.round(p.fee / 4.3) }))] } });
  }
  // The other Analyze tabs read slices of the same fake overview.
  if (path.startsWith("/api/v1/analyze/")) {
    const o = analyzeOverview(q);
    const slice: Record<string, unknown> = { context: { period: o.period, comparisonPeriod: o.comparisonPeriod, filters: o.filters }, financial: o.finance, clients: o.clients, acquisition: o.acquisition, "check-ins": o.checkIns, messaging: o.messaging, training: o.training };
    const key = path.slice("/api/v1/analyze/".length);
    if (key in slice) return ok(slice[key]);
  }
  if (path === "/api/v1/subscriptions/plans") return ok(platformPlans);
  if (path === "/api/v1/me/ai-integrations" && method === "GET") return ok(aiConnections);
  if ((m = path.match(/^\/api\/v1\/me\/ai-integrations\/([^/]+)\/(grants|revoke)$/))) {
    const item = aiConnections.find((c) => c.id === m![1]);
    if (!item) return { status: 404, body: { title: "Not found" } };
    if (m[2] === "grants") item.grants = [...((body as { grants?: string[] })?.grants ?? [])];
    else item.revokedAt = new Date().toISOString();
    item.version += 1;
    return ok(item);
  }
  if (path === "/api/v1/me/ai-actions" && method === "GET") return ok(aiActions);
  if (path === "/api/v1/me/ai-activity" && method === "GET") return ok(aiActivity);
  if (path === "/api/v1/me/ai-programming-preferences" && method === "GET") return ok(aiPreferences);
  if (path === "/api/v1/me/ai-programming-preferences" && method === "PATCH") return ok(Object.assign(aiPreferences, body ?? {}, { version: aiPreferences.version + 1 }));
  if (path === "/api/v1/me/discovery" && method === "GET") return ok(discoveryListing);
  if (path === "/api/v1/me/discovery" && method === "PUT") return ok(Object.assign(discoveryListing, body ?? {}, { version: discoveryListing.version + 1 }));
  if (path === "/api/v1/discovery/coaches") {
    const search = (q.get("search") ?? "").toLowerCase();
    const items = discoveryCoaches.filter((c) => !search || [c.displayName, c.username, c.bio ?? "", ...c.specializations].join(" ").toLowerCase().includes(search));
    return ok({ items, page: 1, pageSize: 18, total: items.length });
  }
  // Quota context for new analyses: no Team, personal plan usage this month.
  if (path === "/api/v1/me/team-context" && method === "GET") return ok(null);
  if (path === "/api/v1/me/usage" && method === "GET") return ok({ planId: platformSubscription.planId, scopeId: me, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", usage: [{ key: "video.local_analyses_per_period", maximum: 30, used: 7 }] });
  if (path === "/api/v1/me/platform-subscription" && method === "GET") return ok(platformSubscription);
  if ((m = path.match(/^\/api\/v1\/me\/platform-subscription\/(checkout|confirm-payment|change-plan)$/)) && method === "POST") {
    const s = platformSubscription as Record<string, unknown>;
    const plan = platformPlans.find((p) => p.id === body?.planId);
    if (m[1] === "checkout" && plan) s.pendingDue = { id: uid(), amount: plan.amount, currency: plan.currency, status: "Pending", dueAt: now(), periodEnd: day(30), planId: plan.id };
    if (m[1] === "confirm-payment" && s.pendingDue) Object.assign(s, { planId: (s.pendingDue as { planId: string }).planId, periodStart: now(), periodEnd: day(30), pendingDue: null });
    if (m[1] === "change-plan") Object.assign(s, { planId: "Free", pendingDue: null, periodEnd: null });
    s.version = (s.version as number) + 1;
    return ok(s);
  }

  // Client side: the invitation and offer shared in the demo chat, the coaches and the payments.
  const revision = { ...offers[0]!, offerId: "77777777-0000-4000-8000-000000000001", coachId: COACH, number: 3, currency: "PLN" };
  const coach = { id: COACH, displayName: "Ola Trener", username: "ola.coach" };
  if ((m = path.match(/^\/api\/v1\/coaching\/invitations\/([^/]+)$/)) && method === "GET") return ok({ id: m[1], coachId: COACH, coach, target: { id: SELF, displayName: "Demo Coach", username: "demo_coach" }, offerRevision: revision, billingOptionId: null, message: "Hi! I think this plan fits your spring goals — have a look.", status: mockInvitationStatus, createdAt: ago(2), respondedAt: mockInvitationStatus === "Pending" ? null : now(), applicationId: null, allowedActions: mockInvitationStatus === "Pending" ? ["accept", "decline"] : mockInvitationStatus === "Accepted" ? ["apply"] : [], version: 1 });
  if ((m = path.match(/^\/api\/v1\/coaching\/invitations\/([^/]+)\/(accept|decline)$/)) && method === "POST") { mockInvitationStatus = m[2] === "accept" ? "Accepted" : "Declined"; return ok({}); }
  if ((m = path.match(/^\/api\/v1\/coaches\/([^/]+)\/offers\/([^/]+)$/))) return ok(revision);
  if (path === "/api/v1/coaching/my-coaches") {
    const term = q.get("search")?.toLowerCase();
    const mine = [
      { id: "88888888-0000-4000-8000-000000000001", status: "Active", coach, client: { id: SELF, displayName: "Demo Coach", username: "demo_coach" }, createdAt: ago(60), updatedAt: ago(1) },
      { id: "88888888-0000-4000-8000-000000000002", status: "Completed", coach: { id: uid(), displayName: "Tomasz Biegacz", username: "tomek.runs" }, client: { id: SELF, displayName: "Demo Coach", username: "demo_coach" }, createdAt: ago(200), updatedAt: ago(30) },
      { id: "88888888-0000-4000-8000-000000000003", status: "Suspended", coach: { id: uid(), displayName: "Ewa Mobilność", username: "ewa.mobility" }, client: { id: SELF, displayName: "Demo Coach", username: "demo_coach" }, createdAt: ago(90), updatedAt: ago(10) },
    ];
    return ok(page(mine.filter((r) => (!q.get("status") || r.status === q.get("status")) && (!term || `${r.coach.displayName} ${r.coach.username}`.toLowerCase().includes(term))), q));
  }
  if ((path === "/api/v1/coaching/applications" && method === "POST") || /^\/api\/v1\/coaching\/applications\/[^/]+$/.test(path)) {
    const sections = [section("About you", ["Main goal", "Training history"]), section("Availability", ["Days per week", "Equipment"])];
    return ok({ application: { id: "aaaaaaaa-0000-4000-8000-000000000001", status: "InProgress", version: 1, offerName: "12-week online coaching", amount: 349, currency: "PLN", selectedSessionCount: null, submittedAt: null, source: "Invitation", allowedActions: ["withdraw", "submit"], relationshipId: null, applicant: { id: SELF, displayName: "Demo Coach", username: "demo_coach" } }, offerRevision: revision, formVersion: { definition: { sections } }, answers: {}, profilePrefill: {}, profileVersion: 1 });
  }
  if (path === "/api/v1/training/purchases") return ok(page([
    { orderId: "po1", name: "Hypertrophy 10-day · self-guided", planId: "44444444-0000-4000-8000-000000000003" },
    { orderId: "po2", name: "Spring 10K plan", planId: null },
  ], q));
  // Transactions: a mix of settled income, plan payments, refunds and open dues (three past due).
  if (path === "/api/v1/me/transactions/summary") {
    // The last 30 days are quiet in the demo, to show the empty summary.
    if (q.get("from") && Date.parse(q.get("from")!) > Date.now() - 31 * 86_400_000) return ok({ currencies: [], settled: 0, upcoming: 0, overdueIncoming: 0, overdueOutgoing: 0, nextDueAt: null });
    return ok({ currencies: [{ currency: "EUR", earned: 2484.5, paid: 72, fees: 276.05, toReceive: 698, toPay: 24, overdueIncoming: 897, overdueOutgoing: 0 }], settled: 14, upcoming: 3, overdueIncoming: 3, overdueOutgoing: 0, nextDueAt: at(4, 9) });
  }
  if (path === "/api/v1/me/transactions") {
    const tx = (i: number, name: string, direction: string, status: string, gross: number, date: string, extra: Record<string, unknown> = {}) => ({ id: `97979797-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, dueId: uid(), paymentId: status === "Succeeded" ? uid() : null, attemptId: null, orderId: uid(), type: "CoachingSubscription", status, direction, name, grossAmount: gross, feeRate: 0.1, feeAmount: gross * 0.1, netAmount: gross * 0.9, currency: "EUR", date, coachId: SELF, clientId: people[1]!.id, serviceId: null, offerId: null, planId: null, failureCode: null, mode: "Simulated", isSettlement: status === "Succeeded" || status === "Refunded", coachName: "Demo Coach", clientName: "Anna Nowak", dueAt: null, overdue: false, ...extra });
    const all = [
      tx(1, "12-week online coaching · Monthly", "Incoming", "Pending", 349, ago(40), { dueAt: ago(9), overdue: true, clientName: "Piotr Zieliński" }),
      tx(2, "Meet prep · Monthly", "Incoming", "Pending", 299, ago(35), { dueAt: ago(5), overdue: true, clientName: "Marta Wiśniewska" }),
      tx(3, "Technique review", "Incoming", "Pending", 249, ago(20), { dueAt: ago(2), overdue: true, clientName: "Kazik Kowalski" }),
      tx(4, "12-week online coaching · Monthly", "Incoming", "Pending", 349, ago(3), { dueAt: at(4, 9) }),
      tx(5, "Meet prep · Monthly", "Incoming", "Pending", 349, ago(2), { dueAt: at(12, 9), clientName: "Marta Wiśniewska" }),
      tx(6, "Metrivum Pro", "Outgoing", "Pending", 24, ago(1), { dueAt: at(20, 9), type: "PlatformSubscription", coachName: "Metrivum", feeAmount: 0, netAmount: 24, feeRate: 0 }),
      tx(7, "12-week online coaching · Monthly", "Incoming", "Succeeded", 349, ago(6)),
      tx(8, "Technique review", "Incoming", "Succeeded", 249, ago(11), { clientName: "Kazik Kowalski" }),
      tx(9, "Metrivum Pro", "Outgoing", "Succeeded", 24, ago(14), { type: "PlatformSubscription", feeAmount: 0, netAmount: 24, feeRate: 0 }),
      tx(10, "Meet prep · Monthly", "Incoming", "Succeeded", 299, ago(18), { clientName: "Marta Wiśniewska" }),
      tx(11, "Hypertrophy 10-day plan", "Outgoing", "Succeeded", 48, ago(22), { type: "TrainingPlan", coachName: "Ola Trener" }),
      tx(12, "Technique review", "Incoming", "Failed", 249, ago(25), { clientName: "Piotr Zieliński", failureCode: "card_declined" }),
      tx(13, "12-week online coaching · Monthly", "Incoming", "Succeeded", 349, ago(36)),
      tx(14, "Meet prep · Monthly", "Outgoing", "Refunded", 299, ago(40), { type: "Refund", clientName: "Marta Wiśniewska" }),
    ];
    const items = all.filter((t) => (!q.get("status") || t.status === q.get("status")) && (!q.get("direction") || t.direction === q.get("direction")) && (!q.get("type") || t.type === q.get("type")) && (!q.get("search") || t.name.toLowerCase().includes(q.get("search")!.toLowerCase())));
    return ok(page(items, q));
  }
  if ((m = path.match(/^\/api\/v1\/me\/transactions\/([^/]+)$/))) return ok({ id: m[1], dueId: uid(), paymentId: null, attemptId: null, orderId: uid(), type: "CoachingSubscription", status: "Pending", direction: "Incoming", name: "12-week online coaching · Monthly", grossAmount: 349, feeRate: 0.1, feeAmount: 34.9, netAmount: 314.1, currency: "EUR", date: ago(40), coachId: SELF, clientId: people[1]!.id, serviceId: null, offerId: null, planId: null, failureCode: null, mode: "Simulated", isSettlement: false, coachName: "Demo Coach", clientName: "Piotr Zieliński", dueAt: ago(9), overdue: true });
  if (path === "/api/v1/me/payment-dues") {
    const due = (i: number, status: string, dueAt: string, extra: Record<string, unknown> = {}) => ({ id: `99999999-0000-4000-8000-00000000000${i}`, orderId: "o1", serviceId: "s1", relationshipId: "r1", coachId: COACH, clientId: SELF, sequence: i, periodStart: dueAt, periodEnd: null, dueAt, status, amount: 349, currency: "PLN", settlementMode: "Simulated", settledAt: status === "Paid" ? dueAt : null, overdue: false, ...extra });
    const dues = [due(4, "AwaitingPayment", at(5, 9)), due(3, "AwaitingPayment", ago(3), { overdue: true }), due(2, "Paid", ago(33)), due(1, "Paid", ago(63))];
    return ok(page(dues.filter((d) => !q.get("status") || d.status === q.get("status")), q));
  }
  if (path === "/api/v1/me/payment-history") {
    const paid = (i: number, settledAt: string) => ({ id: `98989898-0000-4000-8000-00000000000${i}`, dueId: `99999999-0000-4000-8000-00000000000${i}`, attemptId: null, grossAmount: 349, feeRate: 0.05, feeAmount: 17.45, coachNetAmount: 331.55, currency: "PLN", mode: "Simulated", source: "Simulated card", actorId: SELF, settledAt });
    return ok(page([paid(2, ago(33)), paid(1, ago(63))], q));
  }
  if (path === "/api/v1/me/payment-methods" && method === "GET") return ok([{ id: "pm1", label: "Personal card", active: true, createdAt: ago(40) }]);
  if (path === "/api/v1/me/service-subscriptions") return ok([{ id: "sub1", serviceId: "s1", autoRenew: false, paymentMethodId: null, nextPeriodAt: at(5, 9), active: true }]);
  if (path === "/api/v1/me/orders") return ok(page([{ id: "o1", serviceId: "s1", name: "12-week online coaching · Monthly", amount: 349, currency: "PLN", settlementMode: "Simulated", createdAt: ago(63) }], q));

  // Remaining coaching lists (leads, invitations, payments, earnings…) are empty in mock mode.
  if (method === "GET" && /^\/api\/v1\/(coaching|check-ins|me\/(payment|orders)|coaches|offers|forms|billing)/.test(path)) return ok(page([], q));
  return null;
}

let mockPreferences: Record<string, unknown> = { messaging: true, checkIns: true, coaching: true, system: true, programEnding: ["LastWeek"] };
