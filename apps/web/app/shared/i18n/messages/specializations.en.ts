export const specializationsEn = {
  title: "Coaching Specializations", description: "Self-declared areas of expertise, not verified certifications. Available on every plan.",
  add: "Add a specialization", search: "Search, e.g. Powerlifting", full: "You have chosen the maximum",
  selected: (n: number, max: number) => `${n}/${max} selected`, primaryCount: (n: number, max: number) => `${n}/${max} primary`,
  primary: "Primary", makePrimary: "Mark as primary", markPrimary: (name: string) => `Mark ${name} as primary`, remove: (name: string) => `Remove ${name}`,
  limit: "Choose up to 10 and mark up to 5 as primary. New picks are primary while there is room.",
  filterHint: "Matches any selected specialization. Coaches covering more of your selections appear first.", filterEmpty: "No specializations chosen.",
  empty: "Nothing chosen yet. Start typing above.", saved: "Coaching specializations saved.", edit: "Edit specializations", optional: "Optional. You can also add these later from your coach profile.",
  selectedWord: "selected", primaryWord: "primary", toggleHint: "Click a chip to make it primary or regular.",
  primaryFull: "Five are primary already. Make one regular first.",
};
