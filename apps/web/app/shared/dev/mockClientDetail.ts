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
    plannedSets: done ? 12 : null, performedSets: done ? [12, 11, 7, 12, 4][i % 5] : null, completedAt: done ? iso(i * 2 - 4, 8) : null, sessionRpe: done ? 7 + (i % 3) : null, rating: done ? 3 + (i % 3) : null,
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
  // A program's own assignments: the demo plan has one client on it.
  if (path === "/api/v1/training/assignments" && q.get("programId"))
    return ok(page(q.get("programId") === PROGRAM ? [{ id: "as-1", relationshipId: "33333333-0000-4000-8000-000000000001", programId: PROGRAM, programName: "Strength block A", status: "Active", startDate: date(30), timeZone: "Europe/Warsaw", version: 1, effectiveRevisionId: "rev", allowedActions: ["status"], groupAssignmentId: null }] : [], q));
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
      feedback: [8, 7, 6, 5, 4, 3, 2, 1, 0].map((d, k) => ({ occurrenceId: `occ-f${k}`, date: date(d * 3), rating: [4, 3, 4, 5, 4, 4, 5, 4, 5][k]!, sessionRpe: [7, 8, 7.5, 8, 8.5, 7, 8, 9, 8][k]!, wellbeing: [3, 3, 4, 4, 3, 4, 4, 5, 4][k]!, sleepQuality: [2, 3, 3, 4, 3, 3, 4, 4, 4][k]! })),
      totalTrainingSeconds: 9 * 2900, averageSessionSeconds: 2900, sessionsPerWeek: 2.3,
      weeks: [0, 1, 2, 3].map((w) => ({ weekStart: date(w * 7 + 6), scheduled: 4, completed: 4 - (w % 3), completionPercentage: Math.round(((4 - (w % 3)) / 4) * 100) })),
    });
  }
  if (path === "/api/v1/check-ins/requests") return ok(page(checkIns.filter((c) => !q.get("status") || c.status === q.get("status")), q));
  let m: RegExpMatchArray | null;
  // The coaching relationship of the mock workouts, with the client's name.
  if (path === "/api/v1/coaching/relationships/r") return ok({ id: "r", status: "Active", client: { id: "c1", displayName: "Kazik Kowalski", username: "kazik_kowal" }, version: 1 });
  // Catalog details (muscles) for the mock workout's exercises.
  if ((m = path.match(/^\/api\/v1\/exercises\/(x\d+)$/))) {
    const muscles: Record<string, [string, string[], string[]]> = {
      x1: ["Back squat", ["quadriceps", "gluteus-maximus"], ["hamstrings"]], x2: ["Romanian deadlift", ["hamstrings", "gluteus-maximus"], []],
      x3: ["Walking lunge", ["quadriceps", "gluteus-maximus"], ["hamstrings"]], x4: ["Plank", ["rectus-abdominis"], []],
      x9: ["Hip thrust", ["gluteus-maximus"], ["hamstrings"]], x10: ["Calf raise", ["gastrocnemius"], []],
    };
    const [name, primary, secondary] = muscles[m[1]!] ?? ["Exercise", [], []];
    return ok({ id: m[1], name, description: "", instructions: "", demonstrationUrl: null, version: 1, isArchived: false, isFavorite: false, isOwn: false, createdAt: iso(90), updatedAt: iso(90),
      tags: [], primaryMuscleKeys: primary, secondaryMuscleKeys: secondary, movementPatternKeys: [] });
  }
  // Planned against actual for one logged workout.
  if (/^\/api\/v1\/training\/executions\/[^/]+\/comparison$/.test(path)) {
    const r = (minimum: number, maximum = minimum) => ({ minimum, maximum });
    const set = (status: string, plannedReps: [number, number] | null, actualReps: number | null, plannedLoadKg: number | null, actualLoadKg: number | null, plannedRpe: number | null, actualRpe: number | null, deviations: string[] = []) =>
      ({ status, plannedReps: plannedReps && r(...plannedReps), actualReps, plannedLoadKg: plannedLoadKg == null ? null : r(plannedLoadKg), actualLoadKg, plannedRpe, actualRpe, plannedRir: null, actualRir: null, deviations });
    return ok({
      executionId: "ex-0", name: "Lower body", performedDate: date(4), plannedExercises: 4, performedExercises: 4, plannedSets: 12, performedSets: 11,
      plannedReps: r(84, 96), actualReps: 90, plannedVolumeKg: r(4200, 4600), actualVolumeKg: 4530, definition: "Compared with the plan version saved when the workout started. Blank values stay unknown.",
      feedback: null,
      exercises: [
        { plannedInstanceId: "i1", actualExerciseId: "x1", name: "Back squat", status: "Completed", plannedSets: 4, performedSets: 4, sets: [set("Completed", [8, 8], 8, 60, 60, null, 6), set("Completed", [5, 5], 5, 110, 110, 8, 8), set("Completed", [5, 5], 5, 110, 110, 8, 8), set("Completed", [5, 5], 4, 110, 110, 8.5, 9.5, ["REPS_BELOW", "RPE_ABOVE"])] },
        { plannedInstanceId: "i2", actualExerciseId: "x2", name: "Romanian deadlift", status: "Completed", plannedSets: 3, performedSets: 3, sets: [set("Completed", [8, 10], 10, 80, 80, null, 8), set("Completed", [8, 10], 10, 80, 80, null, 8), set("Completed", [8, 10], 10, 85, 85, null, 9)] },
        { plannedInstanceId: "i3", actualExerciseId: "x3", name: "Walking lunge", status: "Partial", plannedSets: 3, performedSets: 2, sets: [set("Completed", [10, 12], 12, null, null, null, 8), set("Completed", [10, 12], 12, null, null, null, 8), set("Skipped", [12, 15], null, null, null, null, null)] },
      ],
    });
  }
  // One workout: the planned exercises and sets, a coach note, and the log once it is done.
  if ((m = path.match(/^\/api\/v1\/training\/workouts\/([^/]+)$/))) {
    const occurrence = occurrences.find((o) => o.id === m![1]) ?? { ...occurrences[7]!, id: m[1]!, allowedActions: ["start", "skip"] };
    const live = occurrence.status === "Scheduled" ? { ...occurrence, allowedActions: ["start", "skip"] } : occurrence;
    const reps = (minimum: number, maximum: number) => ({ minimum, maximum });
    const kg = (minimum: number, maximum = minimum) => ({ minimum: { value: minimum, unit: "kg" }, maximum: { value: maximum, unit: "kg" } });
    const rest = (value: number) => ({ value, unit: "s" });
    type Amount = { value: number; unit: string };
    type Target = { reps?: { minimum: number; maximum: number }; load?: { minimum: Amount; maximum: Amount }; rest?: Amount; rpe?: number; rir?: number; tempo?: string; workTime?: Amount };
    const plan: { id: string; exerciseId: string; comment: string; sets: { id: string; kind: string; prescription: Target }[] }[] = [
      { id: "i1", exerciseId: "x1", comment: "Brace hard, sit between the hips.", sets: [
        { id: "s1", kind: "Warmup", prescription: { reps: reps(8, 8), load: kg(60), rest: rest(60) } },
        { id: "s2", kind: "Standard", prescription: { reps: reps(5, 5), load: kg(110), rpe: 8, rest: rest(180), tempo: "30X1" } },
        { id: "s3", kind: "Standard", prescription: { reps: reps(5, 5), load: kg(110), rpe: 8, rest: rest(180), tempo: "30X1" } },
        { id: "s4", kind: "Standard", prescription: { reps: reps(5, 5), load: kg(110), rpe: 8.5, rest: rest(180), tempo: "30X1" } },
      ] },
      { id: "i2", exerciseId: "x2", comment: "", sets: [
        { id: "s5", kind: "Standard", prescription: { reps: reps(8, 10), load: kg(80, 85), rir: 2, rest: rest(120) } },
        { id: "s6", kind: "Standard", prescription: { reps: reps(8, 10), load: kg(80, 85), rir: 2, rest: rest(120) } },
        { id: "s7", kind: "Standard", prescription: { reps: reps(8, 10), load: kg(80, 85), rir: 1, rest: rest(120) } },
      ] },
      { id: "i3", exerciseId: "x3", comment: "Slow on the way down.", sets: [
        { id: "s8", kind: "Standard", prescription: { reps: reps(10, 12), rest: rest(90) } },
        { id: "s9", kind: "Standard", prescription: { reps: reps(10, 12), rest: rest(90) } },
        { id: "s10", kind: "Dropset", prescription: { reps: reps(12, 15), rest: rest(90) } },
      ] },
      { id: "i4", exerciseId: "x4", comment: "", sets: [
        { id: "s11", kind: "Standard", prescription: { workTime: { value: 45, unit: "s" }, rest: rest(30) } },
        { id: "s12", kind: "Standard", prescription: { workTime: { value: 45, unit: "s" }, rest: rest(30) } },
      ] },
    ];
    const names: Record<string, string> = { x1: "Back squat", x2: "Romanian deadlift", x3: "Walking lunge", x4: "Plank" };
    const exercises = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, { id, name, version: 1 }]));
    const done = live.status === "Completed";
    const execution = done ? {
      id: live.executionId, version: 3, status: "Completed", performedDate: live.performedDate, startedAt: iso(2, 7), completedAt: iso(2, 8), comment: "Felt strong, last squat set was a grind.",
      durationSeconds: live.durationSeconds, allowedActions: ["correct"], feedback: { rating: 4, sessionRpe: 8, wellbeing: 4, sleepQuality: 3, note: "Good session" },
      exercises: [...plan.filter((e) => e.id !== "i4").map((e) => ({ prescribedInstanceId: e.id, exerciseId: e.id === "i2" ? "x9" : e.exerciseId, name: e.id === "i2" ? "Hip thrust" : names[e.exerciseId], comment: "", sets: e.sets.map((s, k) => ({
        id: `a-${s.id}`, prescribedSetId: s.id, prescribedSegmentId: null, skipped: false, reps: s.prescription.reps?.maximum ?? null, load: s.prescription.load?.minimum.value ?? null,
        loadUnit: "kg", loadMeaning: "TotalExternal", rpe: k === e.sets.length - 1 ? 9 : 8, rir: null, durationSeconds: s.prescription.workTime?.value ?? null, distanceMeters: null, restSeconds: null, tempo: null, comment: "",
      })).map((set) => (set.prescribedSetId === "s10" ? { ...set, skipped: true, reps: null, rpe: null } : set)) })),
      { prescribedInstanceId: null, exerciseId: "x10", name: "Calf raise", comment: "", sets: [1, 2].map((n) => ({ id: `extra-${n}`, prescribedSetId: null, prescribedSegmentId: null, skipped: false, reps: 15, load: 40, loadUnit: "kg", loadMeaning: "TotalExternal", rpe: 7, rir: null, durationSeconds: null, distanceMeters: null, restSeconds: null, tempo: null, comment: "" })) }],
    } : live.status === "Skipped" ? { id: live.executionId ?? "skip", version: 1, status: "Skipped", performedDate: live.scheduledDate, startedAt: iso(3), completedAt: null, comment: "Travelling for work", durationSeconds: null, allowedActions: [], exercises: [] } : null;
    return ok({
      occurrence: live,
      prescription: {
        annotations: [{ id: "n1", kind: "Coach note", title: "Heavy day", content: "Keep the squat at RPE 8. If the bar slows down on the third set, stop there.", visibility: "Client" }],
        workout: { id: "w1", name: live.name, description: "Strength focus. Warm up for 10 minutes before the first set.", exercises: plan, groups: [] },
        exercises, formulas: {},
      },
      execution,
    });
  }
  // One check-in with its form and, once submitted, the answers.
  if ((m = path.match(/^\/api\/v1\/check-ins\/(?:relationships\/([^/]+)\/)?requests\/([^/]+)$/))) {
    const found = checkIns.find((c) => c.id === m![2]) ?? checkIns[0]!;
    const request = { ...found, relationshipId: m[1] ?? found.relationshipId };
    const questions = [
      ...[["energy", "How was your energy this week?"], ["sleep", "How did you sleep?"]].map(([key, label], order) => ({ key, label, type: "ShortText", required: order === 0, order, helpText: null })),
      { key: "rpe", label: "How hard was training overall?", type: "Scale", required: true, order: 2, helpText: null, min: 1, max: 10, minLabel: "Very easy", maxLabel: "Maximal" },
      { key: "pain", label: "Any pain or niggles?", type: "SingleChoice", required: false, order: 3, helpText: "Pick the closest one.", choices: [{ key: "none", label: "None" }, { key: "mild", label: "Mild, did not affect training" }, { key: "limiting", label: "Limited my training" }] },
      { key: "notes", label: "Anything else for your coach?", type: "LongText", required: false, order: 4, helpText: null },
    ];
    return ok({
      request,
      form: { coachId: "00000000-0000-4000-8000-000000000000", definition: { sections: [{ key: "week", title: "This week", order: 0, questions }] } },
      submission: request.submittedAt ? { answers: { energy: "Good, a bit tired on Friday.", sleep: "7 hours on average.", rpe: 7, pain: "mild" } } : null,
      coachPrivateNotes: null,
    });
  }
  if (path.match(/^\/api\/v1\/check-ins\/relationships\/[^/]+\/summary$/)) return ok({ awaitingReview: 1, overdue: 1, submitted: 5, reviewed: 4, lastCheckIn: checkIns[0], nextDueAtUtc: iso(-4) });
  if ((m = path.match(/^\/api\/v1\/coaching\/relationships\/([^/]+)\/(.+)$/))) {
    const rest = m[2]!;
    if (rest === "services") return ok(page([{ ...service, relationshipId: m[1] }], q));
    if (rest === "billing") {
      const due = (i: number, status: string, days: number, extra: Record<string, unknown> = {}) => ({ id: `99999999-1000-4000-8000-00000000000${i}`, orderId: "o-1", serviceId: "svc-1", relationshipId: m![1], coachId: "c", clientId: "k", sequence: i, periodStart: iso(days), periodEnd: null, dueAt: iso(days), status, amount: 450, currency: "PLN", settlementMode: "Platform", settlementSource: status === "Paid" ? "Card" : null, settledAt: status === "Paid" ? iso(days) : null, overdue: false, ...extra });
      const dues = [due(4, "AwaitingPayment", -20), due(3, "AwaitingPayment", 3, { overdue: true }), due(2, "Paid", 33), due(1, "Paid", 63)].filter(d => !q.get("status") || d.status === q.get("status"));
      const pay = (i: number, days: number) => ({ id: `99999999-2000-4000-8000-00000000000${i}`, settledAt: iso(days), grossAmount: 450, feeAmount: 45, coachNetAmount: 405, currency: "PLN", mode: "Platform", source: "Card" });
      return ok({ dues: page(dues, q), orders: [{ id: "o-1", name: "12-week online coaching" }], attempts: [{ id: "a-1", createdAt: iso(4), status: "Failed", failureCode: "card_declined" }], payments: [pay(2, 33), pay(1, 63)], transactions: [], summary: { lastSettlement: { grossAmount: 450, currency: "PLN", settledAt: iso(33), mode: "Platform" }, overdueByCurrency: [{ count: 1, amount: 450, currency: "PLN" }], nextDue: { amount: 450, currency: "PLN", dueAt: iso(-20) } } });
    }
    if (rest === "profile")
      return ok({ currentAllowedProfile: { Sex: "Male", Height: 178, Weight: 81, BodyFat: 17, HrMax: 186, TrainingExperience: "4 years of strength training", ActivityLevel: "Moderately active", AvailableEquipment: ["Barbell", "Dumbbells", "Pull-up bar"], PreferredTrainingDays: [1, 3, 5, 6], SessionsPerWeek: 4, AvailableSessionDuration: 70, Sleep: 7, Stress: 5, InjuriesLimitationsPainNotes: "Old left knee meniscus repair", AdditionalNotes: "Half marathon under 1:45 in spring." } });
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
