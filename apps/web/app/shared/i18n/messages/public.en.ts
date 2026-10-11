// Public site copy (EN). Every claim must match what the API actually does today.
export const publicEn = {
  common: {
    brand: "TrainFlow",
    skipToContent: "Skip to content",
    illustrativePreview: "Illustrative preview",
    illustrativePreviewNote: "Sample data drawn for this page, not a live account.",
    languageLabel: "Language",
    languageNames: { en: "English", pl: "Polski" },
    learnMore: "Learn more",
  },
  nav: {
    primary: "Primary",
    home: "TrainFlow home",
    features: "Features",
    programBuilder: "Program builder",
    videoAnalysis: "Video analysis",
    pricing: "Pricing",
    signIn: "Sign in",
    getStarted: "Create account",
    openApp: "Open TrainFlow",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  footer: {
    tagline: "A workspace for coaches who write training programs.",
    product: "Product",
    account: "Account",
    register: "Create account",
    signIn: "Sign in",
    legalPending: "Privacy policy and terms will be published here before public registration opens.",
    copyright: (year: number) => `© ${year} TrainFlow`,
  },
  home: {
    meta: {
      title: "TrainFlow — the training spreadsheet, rebuilt for coaches",
      description:
        "Build training programs from blocks, cycles and days, write sets with ranges, %1RM, RPE and formulas, and export CSV or PDF. Lift video analysis in the same workspace.",
    },
    hero: {
      title: "The training spreadsheet, rebuilt for coaches",
      lead: "Build programs from blocks, cycles and days. Write every set with ranges, %1RM, RPE or a formula, keep templates in folders and export the result to CSV or PDF.",
      primary: "Create an account",
      secondary: "Sign in",
      openApp: "Open TrainFlow",
      tertiary: "See the program builder",
      badge: "8 set types / formulas / csv + pdf",
    },
    sheet: {
      program: "Strength block A",
      cycle: "Cycle 1 · 10 days",
      day: "Day 3",
      workout: "Lower body",
      columns: { exercise: "Exercise", set: "Set", reps: "Reps", load: "Load", effort: "Effort", rest: "Rest" },
      rows: [
        { exercise: "Back squat", set: "Top set", reps: "3", load: "85% · 1RM", effort: "RPE 8", rest: "4 min" },
        { exercise: "Back squat", set: "Back-off", reps: "5", load: "−10%", effort: "RPE 7", rest: "3 min" },
        { exercise: "Romanian deadlift", set: "Ramp", reps: "8–10", load: "60 → 80 kg", effort: "RIR 2", rest: "2 min" },
        { exercise: "Split squat", set: "Standard", reps: "10", load: "24 kg", effort: "RIR 3", rest: "90 s" },
        { exercise: "Copenhagen plank", set: "Cluster", reps: "4×20 s", load: "—", effort: "—", rest: "60 s" },
      ],
      formula: "base1Rm × percentage",
      formulaResult: "140 kg × 0.85 = 119 kg",
      saved: "Draft saved",
      tools: { sheet: "Sheet", formulas: "Formulas", copy: "Copy", history: "History" },
      recentTitle: "Recent edits",
      recent: [
        { what: "back squat / top set", value: "85% 1rm", when: "now" },
        { what: "romanian deadlift / ramp", value: "60 → 80 kg", when: "2 min" },
        { what: "cycle 1 / length", value: "10 days", when: "6 min" },
      ],
    },
    cycles: {
      title: "Cycles that fit the plan, not the calendar",
      body: "A cycle can last 7, 9 or 10 days — anything from 1 to 366. Training days are numbered inside the cycle, so sessions land exactly where you put them.",
      legendTraining: "Training day",
      legendRest: "Rest day",
      dayLabel: (n: number) => `Day ${n}`,
      cycleLabel: (n: number, days: number) => `Cycle ${n} — ${days} days`,
    },
    sets: {
      title: "Every set has a type",
      body: "Standard, AMRAP, top sets with back-offs, ramps, drop sets, rest-pause and clusters. Segments and references are stored as data, so a back-off always knows which top set it follows.",
      kinds: {
        Standard: "Standard",
        Amrap: "AMRAP",
        TopSet: "Top set",
        BackOff: "Back-off",
        Ramp: "Ramp",
        DropSet: "Drop set",
        RestPause: "Rest-pause",
        Cluster: "Cluster",
      },
      kindNotes: {
        Standard: "Fixed or ranged reps and load",
        Amrap: "As many reps as possible, no fixed range",
        TopSet: "Heaviest set of the exercise",
        BackOff: "Linked to an earlier top set",
        Ramp: "2–20 segments climbing in load",
        DropSet: "Load drops between segments",
        RestPause: "Short pauses inside one set",
        Cluster: "Intra-set rest between mini-sets",
      },
      groupsTitle: "Supersets and circuits",
      groupsBody: "Pair two exercises as a superset or chain several into a circuit with rounds and rest.",
    },
    formulas: {
      title: "Loads that calculate themselves",
      body: "Use built-in formulas such as a percentage of 1RM, or write your own with typed units. The server evaluates each formula at a pinned version, so a published program never shifts under you.",
      builtIns: "Built-in formulas",
      builtInNames: ["Percentage of 1RM", "Previous cycle + increment", "Top set → back-off"],
      inputs: "Inputs",
      result: "Result",
    },
    library: {
      title: "One exercise library for every program",
      body: "Search the shared catalog by tag, primary and secondary muscles or movement pattern, and keep favourites close. Exercises retired from the catalog stay readable in programs that already use them.",
      searchPlaceholder: "Search exercises",
      filters: ["Hinge", "Quadriceps", "Unilateral", "Favourites"],
      items: [
        { name: "Romanian deadlift", meta: "Hinge · Hamstrings, glutes" },
        { name: "Bulgarian split squat", meta: "Squat · Quadriceps, glutes" },
        { name: "Single-leg hip thrust", meta: "Hinge · Glutes" },
        { name: "Nordic curl", meta: "Knee flexion · Hamstrings" },
      ],
    },
    folders: {
      title: "Folders, templates and independent copies",
      body: "Organise programs and private templates in nested folders. Start a program from a template and get a complete copy — editing it never changes the original.",
      tree: ["Off-season", "Hypertrophy", "Templates", "Strength 10-day"],
      copyAction: "Use template",
      copied: "Independent copy created",
    },
    transfer: {
      title: "Bring spreadsheets in, send clean files out",
      body: "Import a CSV, map rows to catalog exercises, validate, then commit. Export a published revision — or a single block, cycle or workout — to CSV or a PDF generated on the server.",
      importLabel: "Import",
      exportLabel: "Export",
      steps: ["Preview", "Map exercises", "Validate", "Commit"],
      revisionMeta: "Revision 3",
      sourceMeta: "UTF-8 · 3 KB",
      files: { csvIn: "spring-block.csv", pdfOut: "strength-block-a-r3.pdf", csvOut: "strength-block-a-r3.csv" },
      hub: { rows: "38 rows matched", check: "0 errors" },
    },
    video: {
      title: "Lift analysis next to the program",
      body: "Upload a lift to your private video library, start an analysis and follow its status. With an analyzer connected you get repetitions, phase timings and the bar path, and you can compare two lifts side by side.",
      honesty:
        "Measurements come from an analyzer service connected to your TrainFlow deployment. Until one is connected, new analyses stop with an “analyzer not configured” status — TrainFlow never shows simulated results.",
      statuses: { Queued: "Queued", Processing: "Processing", Completed: "Completed" },
      repLabel: (n: number) => `Rep ${n}`,
      phases: { eccentric: "Eccentric", concentric: "Concentric" },
      pathLabel: "Bar path",
    },
    workflow: {
      title: "How work moves through TrainFlow",
      steps: [
        { title: "Set up your workspace", body: "Create an account, confirm your email and finish a short onboarding." },
        { title: "Build or import", body: "Start from scratch, from a template or from a CSV file you already have." },
        { title: "Publish a revision", body: "Publishing saves a private, immutable version of the draft. It is not sent to anyone." },
        { title: "Export and review", body: "Download CSV or PDF from a revision and keep lift videos next to the program." },
      ],
    },
    faq: {
      title: "Questions coaches ask",
      items: [
        {
          q: "Who is TrainFlow for?",
          a: "Coaches who write training programs, and the clients they work with. Coaches build programs and run their practice; clients answer check-ins, read messages and follow their calendar.",
        },
        {
          q: "Can I send programs to athletes from TrainFlow?",
          a: "Not inside TrainFlow. Export a published revision to PDF or CSV and share it the way you already do.",
        },
        {
          q: "Do cycles have to be one week long?",
          a: "No. A cycle can last from 1 to 366 days, and training days are numbered inside it.",
        },
        {
          q: "What does the CSV import change before I confirm it?",
          a: "Nothing. The import is a temporary session: preview, map exercises and validate. A program is created only when you commit, and the importer never creates new exercises.",
        },
        {
          q: "Does video analysis work today?",
          a: "Uploading and organising videos works. Measurements need an analyzer service connected to your deployment; without it, new analyses report “analyzer not configured” instead of showing invented numbers.",
        },
        {
          q: "Which languages are available?",
          a: "English and Polish. Your program content stays exactly as you write it — it is never translated automatically.",
        },
      ],
    },
    facts: [
      { value: "1–366", label: "days in a cycle, never tied to weeks" },
      { value: "8", label: "set types, from AMRAP to clusters" },
      { value: "%1RM", label: "RPE, RIR or a formula in any set" },
      { value: "CSV + PDF", label: "in and out, from a published revision" },
    ],
    showcase: {
      title: "One workspace for the whole block",
      subtitle: "from cycle length to a single set",
      tabs: ["Cycles", "Set types", "Formulas", "Library", "Folders"],
    },
    pricing: {
      title: "Plans that grow with you",
      subtitle: "from first program to full roster",
      billingLabel: "Billing period",
      monthly: "Monthly",
      yearly: "Yearly",
      yearlySaving: "",
      numberLocale: "en-US",
      currency: "USD",
      perMonth: "per month", perPersonMonth: "per person / month",
      billedMonthly: "Billed monthly",
      billedYearly: (total: string) => `${total} billed yearly`,
      freeForever: "Free, no card needed",
      recommended: "Recommended",
      plans: [
        {
          id: "free",
          name: "Free",
          monthly: 0,
          yearly: 0,
          description: "For writing your own training and getting to know the builder.",
          cta: "Start for free",
          lead: "Included in every plan",
          features: ["All current features, including Free", "Programs, templates and custom formulas", "Clients, groups, forms and check-ins", "Messages, calendar, offers and payments", "Video analysis and analytics"],
        },
        {
          id: "pro",
          name: "Pro",
          monthly: 25,
          yearly: 25,
          description: "For coaches who work one to one with their clients.",
          cta: "Start with Pro",
          lead: "Included in every plan",
          features: ["All current features, including Free", "Programs, templates and custom formulas", "Clients, groups, forms and check-ins", "Messages, calendar, offers and payments", "Video analysis and analytics"],
        },
        {
          id: "team",
          name: "Team",
          monthly: 20,
          yearly: 20,
          description: "For coaching businesses with groups and paid offers.",
          cta: "Start with Team",
          lead: "Included in every plan",
          features: ["All current features, including Free", "Programs, templates and custom formulas", "Clients, groups, forms and check-ins", "Messages, calendar, offers and payments", "Video analysis and analytics"],
        },
      ],
      note: "Prices in US dollars, excluding VAT. Free currently has no plan-based feature restrictions. Team checkout is coming soon.",
    },
    landing: {
      heroNoteLabel: "New",
      heroNote: "Lift video analysis in the same workspace",
      statement: {
        lead: "A different kind of training tool.",
        rest: "Purpose-built for coaches who write programs, with blocks, cycles and typed sets at its core. TrainFlow keeps the speed of a spreadsheet and adds the structure a program needs.",
      },
      pillars: [
        { title: "Built like a training plan", body: "Blocks, cycles of any length and numbered days: the structure coaches already think in." },
        { title: "Sets stored as data", body: "Eight set types, ranges, %1RM, RPE and formulas are fields, not text typed into a cell." },
        { title: "Your work leaves cleanly", body: "Import a CSV you already have and export any published revision to CSV or PDF." },
      ],
      chapters: {
        structure: {
          title: "Plan and structure",
          lead: "Lay out a block from cycle length down to a single day, and keep programs and templates in folders. A template always gives you an independent copy.",
        },
        sets: {
          title: "Sets, loads and exercises",
          lead: "Write every set with a type and let formulas work out the load. Pick exercises from one shared library.",
        },
        files: {
          title: "Import and export",
          lead: "Bring an existing spreadsheet in through a validated import and send published revisions out as files.",
        },
        video: {
          title: "Lift video analysis",
          lead: "Keep lift videos next to the program and follow each analysis from upload to result.",
        },
      },
    },
    finalCta: {
      title: "Start your next block in TrainFlow",
      body: "Create an account, finish onboarding and build your first program.",
    },
  },
  features: {
    meta: {
      title: "Features — TrainFlow",
      description:
        "What TrainFlow does today: exercise library, folders and templates, a spreadsheet-style program editor with formulas, CSV/PDF export and lift video analysis.",
    },
    title: "What TrainFlow does today",
    lead: "Everything below is part of the current product. Some features may be enabled per account; the app shows what is available to you.",
    groups: [
      {
        id: "library",
        title: "Exercise library",
        items: [
          "Shared catalog with search, tags, muscles and movement patterns",
          "Favourites for quick access",
          "Description and instruction history",
          "Add exercises when your account allows it",
        ],
      },
      {
        id: "organise",
        title: "Folders and templates",
        items: [
          "Nested folders for programs and templates",
          "Private templates you can copy into new programs",
          "Archive and restore instead of silent deletion",
          "Search, sort and filter that stay in the URL",
        ],
      },
      {
        id: "editor",
        title: "Program editor",
        items: [
          "Blocks, cycles of any length, numbered days and workouts",
          "Eight set types, supersets and circuits",
          "Ranges, kg/lb, %1RM, RPE or RIR, time, rest, tempo and distance",
          "Drafts with conflict detection and private published revisions",
        ],
      },
      {
        id: "formulas",
        title: "Formulas",
        items: [
          "Built-in percentage, progression and back-off formulas",
          "Custom formulas with typed units and versions",
          "Evaluation on the server, pinned in each revision",
        ],
      },
      {
        id: "files",
        title: "Import and export",
        items: [
          "CSV import with preview, exercise mapping and validation",
          "CSV and PDF export of a whole program or a block, cycle or workout",
          "Comma, semicolon or tab delimiters",
        ],
      },
      {
        id: "video",
        title: "Video analysis",
        items: [
          "Private video library (MP4, WebM and MOV)",
          "Analysis jobs with status you can follow after a refresh",
          "Repetitions, phases and bar path when an analyzer is connected",
          "Side-by-side comparison of two analyses",
        ],
      },
    ],
    scopeTitle: "What TrainFlow is not",
    scopeBody:
      "TrainFlow is a coach's workspace. It does not manage clients, payments, messaging or calendars, and there is no mobile app.",
    detailLinks: { programBuilder: "Program builder in detail", videoAnalysis: "Video analysis in detail" },
  },
  programBuilder: {
    meta: {
      title: "Program builder — TrainFlow",
      description:
        "Blocks, cycles of any length, numbered days, eight set types, formulas and server-generated CSV/PDF. How the TrainFlow program editor works.",
    },
    eyebrowBack: "All features",
    title: "A program editor that understands sets",
    lead: "TrainFlow stores a program as typed data, not as text in cells. Units, references and IDs survive copying, importing and exporting.",
    structureTitle: "Structure",
    structureBody: "Each level holds the next one. Empty levels are valid in a draft, so you can sketch first and fill in later.",
    structure: [
      { name: "Program", note: "Name, description, folder" },
      { name: "Block", note: "A phase such as accumulation or peaking" },
      { name: "Cycle", note: "1–366 days, not tied to weeks" },
      { name: "Day", note: "Numbered inside the cycle" },
      { name: "Workout", note: "One or more per day" },
      { name: "Exercise", note: "From the shared catalog, with a comment" },
      { name: "Set", note: "Typed prescription and optional segments" },
    ],
    prescriptionTitle: "What a set can say",
    prescription: [
      { label: "Repetitions", value: "Exact or a range, e.g. 5 or 8–10" },
      { label: "Load", value: "kg or lb, exact or ranged" },
      { label: "Relative load", value: "% of a base value such as 1RM" },
      { label: "Effort", value: "RPE 0–10 or RIR — one or the other" },
      { label: "Time and distance", value: "Work time, rest, metres or kilometres" },
      { label: "Tempo", value: "Four phases, e.g. 3-1-X-0" },
      { label: "Formula", value: "Built-in or custom, evaluated by the server" },
    ],
    editorTitle: "Working in the editor",
    editor: [
      { title: "Keyboard first", body: "Move between cells with the arrow keys, edit with Enter, leave with Escape. Typing in a cell never triggers sheet-wide shortcuts." },
      { title: "Copy, paste and reorder", body: "Copy prescriptions between sets, duplicate exercises, workouts, cycles and blocks, and move items with buttons or keyboard shortcuts as well as by dragging." },
      { title: "Undo what you did", body: "Undo and redo cover your local edits. They do not pretend to be a server-side version history." },
      { title: "Saving you can trust", body: "Every save carries the version you started from. If the program changed elsewhere, you see a conflict and keep your work." },
    ],
    draftLabel: "Draft",
    revisionsTitle: "Drafts and revisions",
    revisionsBody:
      "The draft is what you edit. Publishing stores a private, immutable revision with exercise data and formula results captured at that moment. Exports are generated from a revision, so you always know which version you are downloading.",
    filesTitle: "CSV in, CSV and PDF out",
    filesBody:
      "Imports run as a temporary session: preview, map exercises, validate and commit. Exports come from the server for the whole program or for one block, cycle or workout.",
  },
  videoAnalysis: {
    meta: {
      title: "Video analysis — TrainFlow",
      description:
        "Private lift video library, durable analysis jobs, repetitions, phases, bar path and comparisons. How TrainFlow video analysis works and what it needs.",
    },
    eyebrowBack: "All features",
    title: "Lift analysis in your workspace",
    lead: "Keep lift videos private, run analyses as background jobs and read results next to your programs.",
    flowTitle: "From upload to result",
    flow: [
      { title: "Upload", body: "Choose an MP4, WebM or MOV file. TrainFlow reserves the upload and the file goes straight to private storage." },
      { title: "Verify", body: "The server checks the stored file type and size before the video becomes ready." },
      { title: "Analyse", body: "Start an analysis with a name, tags and notes. It runs in the background and survives a page refresh." },
      { title: "Review", body: "Read repetitions, phase timings and the bar path, or compare two analyses." },
    ],
    resultsTitle: "What a result contains",
    results: [
      { label: "Repetitions", value: "Start and end time of each repetition" },
      { label: "Phases", value: "Timed phases inside every repetition" },
      { label: "Trajectory", value: "Position over time with quality and occlusion flags" },
      { label: "Velocity", value: "Only when the analyzer reports it; never derived from pixels without calibration" },
    ],
    statusTitle: "Analyzer status",
    statusBody:
      "Measurements require an analyzer service connected to your TrainFlow deployment. When none is connected, new analyses end with “analyzer not configured”. That state is shown as it is — there are no placeholder charts or simulated numbers.",
    privacyTitle: "Private by default",
    privacyBody:
      "Videos are stored in a private bucket. Playback uses short-lived signed links that expire after a couple of minutes and are never treated as permanent addresses.",
    limitsNote: "Default limits: MP4, WebM or MOV up to 256 MiB, five uploads in progress at a time. Your deployment may configure different limits.",
  },
  notFound: {
    meta: { title: "Page not found — TrainFlow", description: "This page does not exist." },
    title: "This page does not exist",
    body: "Check the address or go back to the start.",
    home: "Go to the home page",
  },
};

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

export type PublicMessages = Widen<typeof publicEn>;
