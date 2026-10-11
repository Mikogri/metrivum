// Developer mock data for one client's detail tabs (VITE_DEV_MOCKS=1 only). Clearly fake.
const iso = (days: number, hour = 9) => {
  const d = new Date(Date.now() - days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const date = (days: number) => iso(days).slice(0, 10);
const page = <T>(items: T[], q: URLSearchParams) => {
  const p = Number(q.get("page") ?? 1);
  const s = Number(q.get("pageSize") ?? 25);
  return { items: items.slice((p - 1) * s, p * s), total: items.length, page: p, pageSize: s };
};

const PROGRAM = "44444444-0000-4000-8000-000000000001";
const workouts = ["Lower body", "Upper body", "Full body", "Conditioning"];
const statuses = ["Completed", "Completed", "Missed", "Completed", "Skipped", "Completed", "InProgress", "Scheduled"];
const occurrences = Array.from({ length: 18 }, (_, i) => {
  const status = statuses[i % statuses.length]!;
  const done = status === "Completed";
  return {
    id: `occ-${i}`, revisionId: "rev", blockId: "block-1", cycleId: i < 10 ? "cycle-1" : "cycle-2", assignmentId: "as-1", relationshipId: "r", programId: PROGRAM,
    programName: "Strength block A", name: workouts[i % workouts.length]!, scheduledDate: date(i * 2 - 4), deadline: date(i * 2 - 6),
    performedDate: done ? date(i * 2 - 4) : null, durationSeconds: done ? 2700 + i * 120 : null, exerciseCount: done ? 5 + (i % 3) : null,
    hasComment: i % 4 === 0, loggedLate: i === 5, status, executionId: done ? `ex-${i}` : null, allowedActions: [],
  };
});

const measurements = [82.4, 82.1, 81.6, 81.9, 81.2, 80.8, 80.5].map((value, i) => ({
  id: `m-${i}`, relationshipId: "r", key: "weight", unit: "kg", value, observedAt: iso(60 - i * 9), comment: i === 3 ? "After a holiday week" : null,
  authorId: "coach", source: i % 3 === 0 ? "CheckIn" : "Manual", createdAt: iso(60 - i * 9), version: 1, updatedAt: iso(60 - i * 9),
}));

const documents = [
  { id: "d1", title: "Front, relaxed", category: "ProgressPhoto", visibility: "SharedWithClient", description: "Week 4", hasFile: true, contentType: "image/jpeg", observedAt: iso(20) },
  { id: "d2", title: "Side, relaxed", category: "ProgressPhoto", visibility: "CoachPrivate", description: null, hasFile: true, contentType: "image/jpeg", observedAt: iso(20) },
  { id: "d3", title: "Blood test results", category: "Medical", visibility: "SharedWithClient", description: "Annual check-up", hasFile: true, contentType: "application/pdf", observedAt: iso(35) },
  { id: "d4", title: "Injury history", category: "General", visibility: "CoachPrivate", description: null, hasFile: false, contentType: null, text: "Left knee meniscus repair in 2022. No pain in squats to parallel.", observedAt: iso(80) },
].map((d) => ({ relationshipId: "r", text: null, authorId: "coach", source: "Coach", createdAt: d.observedAt, updatedAt: d.observedAt, version: 1, size: d.hasFile ? 248_000 : null, allowedActions: ["edit", "share", "delete"], ...d }));

const notes = [
  { id: "n1", title: "Intake call", text: "Wants a sub-20 5K by spring. Trains mornings before work, 4 days a week.", createdAt: iso(70), updatedAt: iso(70), version: 1, authorId: "coach" },
  { id: "n2", title: "Deload response", text: "Felt flat in week 3; moved the deload one week earlier.", createdAt: iso(12), updatedAt: iso(10), version: 2, authorId: "coach" },
];

const checkIns = Array.from({ length: 7 }, (_, i) => {
  const status = ["Submitted", "Reviewed", "Reviewed", "Overdue", "Reviewed", "Reviewed", "Available"][i]!;
  return {
    id: `ci-${i}`, scheduleId: "s1", scheduleName: "Weekly check-in", relationshipId: "r", formVersionId: "f1", availableAtUtc: iso(i * 7 + 2), dueAtUtc: iso(i * 7),
    status, submittedAt: status === "Submitted" || status === "Reviewed" ? iso(i * 7 + 1) : null, reviewedAt: status === "Reviewed" ? iso(i * 7) : null, cancelledAt: null,
    wasLate: i === 4, version: 1, clientReply: null, reviewedBy: null, assignmentSource: i % 2 ? "Group" : "Direct", assignmentGroups: i % 2 ? [{ id: "g", name: "Marathon block" }] : null,
  };
});

const service = {
  id: "svc-1", relationshipId: "r", applicationId: "app-1", offerName: "12-week online coaching", billingOptionId: "bo-1", selectedSessionCount: null, amount: 450, currency: "PLN",
  orderId: "o1", status: "Active", startedAt: iso(80), completedAt: null, updatedAt: iso(3), version: 1, allowedActions: ["complete"],
  offerRevision: { id: "rev-1", offerId: "offer-1", coachId: "c", number: 2, name: "12-week online coaching", description: "", category: "online-coaching", coachingMode: "Online", tags: [], applicationFormVersionId: "f", currency: "PLN",
    billingOptions: [{ id: "bo-1", name: "Monthly", model: "Subscription", price: 450, minSessions: null, maxSessions: null, sessionCount: null, periodCount: 1, periodUnit: "Month", paymentTerms: null }], publishedAt: iso(90), teamId: null, teamName: null },
  currentBilling: { status: "Paid", remainingSessions: null, periodStart: iso(10), periodEnd: iso(-20), nextDueAt: iso(-20), nextDueAmount: 450, currency: "PLN" },
};

/** Responses for the client detail tabs, or null when the path is not one of them. */
export function mockClientDetail(path: string, method: string, q: URLSearchParams): { status: number; body: unknown } | null {
  const ok = (body: unknown) => ({ status: 200, body });
  if (method !== "GET") return null;
  if (path === "/api/v1/coaching/services/current") return ok([...new Set(q.getAll("relationshipIds"))].map(relationshipId => ({
    relationshipId, offerName: service.offerName, currentBilling: service.currentBilling,
  })));
  if (path === "/api/v1/training/last-activity") return ok({ performedDate: date(1), completedAt: iso(1) });
  if (path === "/api/v1/training/assignment-summary")
    return ok([{ assignment: { id: "as-1", relationshipId: "r", programId: PROGRAM, programName: "Strength block A", status: "Active", startDate: date(40), timeZone: "Europe/Warsaw", version: 1, effectiveRevisionId: "rev", allowedActions: ["status"], groupAssignmentId: null }, endDate: date(-30), scheduled: 36, completed: 17 }]);
  if (path === "/api/v1/training/assignments" && !q.get("relationshipId") && !q.get("programId") && !q.get("groupId"))
    return ok(page([["1", "Strength block A"], ["2", "Return to run"], ["3", "Hypertrophy 10-day"]].map(([n, name]) => ({ id: `as-${n}`, relationshipId: `33333333-0000-4000-8000-00000000000${n}`, programId: PROGRAM, programName: name, status: "Active", startDate: date(30), timeZone: "Europe/Warsaw", version: 1, effectiveRevisionId: "rev", allowedActions: [], groupAssignmentId: null })), q));
  if (path === "/api/v1/training/schedule") return ok(page(occurrences.filter((o) => !q.get("status") || o.status === q.get("status")), q));
  if (path === "/api/v1/training/activity-options")
    return ok({ earliestDate: date(60), programs: [{ id: PROGRAM, name: "Strength block A" }], structure: [{ blockId: "block-1", cycleId: "cycle-1", firstDate: date(40), lastDate: date(20) }, { blockId: "block-1", cycleId: "cycle-2", firstDate: date(19), lastDate: date(0) }] });
  if (path === "/api/v1/training/progress") {
    const lift = (exerciseId: string, name: string, start: number, step: number) =>
      [5, 4, 3, 2, 1, 0].map((w, k) => ({ occurrenceId: `occ-${k}`, exerciseId, name, performedDate: date(w * 6), loadMeaning: "absolute", sets: 4, reps: 20 - k, volumeKg: (start + k * step) * (20 - k), bestLoadKg: start + k * step, averageRpe: 7.5, averageRir: 2, substitutionSets: 0 }));
    return ok({
      from: q.get("from"), to: q.get("to"), planned: 14, due: 12, completed: 9, skipped: 1, missed: 2, inProgress: 1, completionPercentage: 75, loggedLate: 1, activeAssignments: 1,
      actualSets: 164, actualReps: 1240, volumeKg: 58400, programs: [{ programId: PROGRAM, programName: "Strength block A", completed: 9 }], clients: [],
      performance: [...lift("e1", "Back squat", 110, 2.5), ...lift("e2", "Bench press", 80, 1.25)], metricDefinition: "",
      totalTrainingSeconds: 9 * 2900, averageSessionSeconds: 2900, sessionsPerWeek: 2.3,
      weeks: [0, 1, 2, 3].map((w) => ({ weekStart: date(w * 7 + 6), scheduled: 4, completed: 4 - (w % 3), completionPercentage: Math.round(((4 - (w % 3)) / 4) * 100) })),
    });
  }
  if (path === "/api/v1/check-ins/requests") return ok(page(checkIns.filter((c) => !q.get("status") || c.status === q.get("status")), q));
  let m: RegExpMatchArray | null;
  if (path.match(/^\/api\/v1\/check-ins\/relationships\/[^/]+\/summary$/)) return ok({ awaitingReview: 1, overdue: 1, submitted: 5, reviewed: 4, lastCheckIn: checkIns[0], nextDueAtUtc: iso(-4) });
  if ((m = path.match(/^\/api\/v1\/coaching\/relationships\/([^/]+)\/(.+)$/))) {
    const rest = m[2]!;
    if (rest === "services") return ok(page([{ ...service, relationshipId: m[1] }], q));
    if (rest === "billing")
      return ok({ dues: { items: [], page: 1, pageSize: 1, total: 0 }, orders: [], attempts: [], payments: [], transactions: [], summary: { lastSettlement: { grossAmount: 450, currency: "PLN", settledAt: iso(10), mode: "Platform" }, overdueByCurrency: [], nextDue: { amount: 450, currency: "PLN", dueAt: iso(-20) } } });
    if (rest === "profile")
      return ok({ currentAllowedProfile: { TrainingExperience: "4 years of strength training", ActivityLevel: "Moderately active", AvailableEquipment: ["Barbell", "Dumbbells", "Pull-up bar"], PreferredTrainingDays: ["Mon", "Wed", "Fri", "Sat"], SessionsPerWeek: 4, AvailableSessionDuration: "60–75 min", Sleep: "7 h", Stress: "Medium", InjuriesLimitationsPainNotes: "Old left knee meniscus repair", AdditionalNotes: null } });
    if (rest === "applications")
      return ok(page([{ id: "app-1", offerName: "12-week online coaching", submittedAt: iso(82), status: "Accepted", relationshipId: m[1] }], q));
    if (rest === "documentation/") return ok({ status: "Active", coach: true, allowedActions: ["create", "measure"] });
    if (rest === "documentation/measurement-definitions") return ok([{ key: "weight", label: "Body weight", units: ["kg", "lb"] }, { key: "body-fat", label: "Body fat", units: ["%"] }, { key: "waist", label: "Waist", units: ["cm"] }]);
    if (rest === "documentation/measurements") return ok(page([...measurements].reverse(), q));
    if (rest === "documentation/measurements/trend")
      return ok({ key: "weight", unit: "kg", points: measurements.map((x) => ({ observedAt: x.observedAt, value: x.value })), latestValue: 80.5, latestAt: measurements.at(-1)!.observedAt, change: -1.9, aggregation: "Daily average" });
    if (rest === "documentation/notes") return ok(page(notes, q));
    if (rest === "documentation/documents") {
      const photos = q.get("category") === "ProgressPhoto";
      return ok(page(documents.filter((d) => (d.category === "ProgressPhoto") === photos), q));
    }
  }
  return null;
}
