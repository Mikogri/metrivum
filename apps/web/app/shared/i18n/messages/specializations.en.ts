export const specializationsEn = {
  title: "Coaching Specializations", description: "Self-declared areas of expertise, not verified certifications. Available on every plan.",
  search: "Search specializations", selected: (n: number) => `${n}/5 selected`, primaryCount: (n: number) => `${n}/3 primary`,
  primary: "Primary", markPrimary: (name: string) => `Mark ${name} as primary`, remove: (name: string) => `Remove ${name}`,
  limit: "You can select up to 5 specializations and mark up to 3 as primary. Remove a selection to choose another.",
  filterHint: "Matches any selected specialization. Coaches covering more of your selections appear first.",
  empty: "No specializations selected.", saved: "Coaching specializations saved.", edit: "Edit specializations", optional: "Optional. You can also add these later from your coach profile.",
};
