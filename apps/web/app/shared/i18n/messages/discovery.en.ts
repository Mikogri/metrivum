export const discoveryEn = {
  title: "Discover coaches", description: "Find a coach by their specializations, language and way of working.",
  search: "Name, username, introduction or specialization", specialization: "Specialization", language: "Language", location: "Public location", mode: "Coaching mode", allModes: "Any mode",
  online: "Online", offline: "In person", hybrid: "Hybrid", hasOffers: "Has published offers", category: "Offer category", filters: "Filter coaches", clear: "Clear filters",
  featured: "Featured coaches (Pro+)", other: "All coaches", badge: "Featured · Pro+", priority: "Active Pro, Team and Studio subscriptions have equal priority among matching coaches. Featured placement is paid through simulated subscriptions and does not guarantee enquiries.",
  empty: "No coaches match", emptyBody: "Try fewer filters or another search phrase.", profile: "View profile", offers: "View offers", from: "From", offerPrice: "Published offer starting price; payment terms are on the offer page.",
  listingSub: "What clients see when they search, and whether you are listed.", proTitle: "Priority among relevant matches", proBody: "Pro, Team and Studio share equal paid priority among coaches with comparable specialization relevance. Relevance comes first.",
  proOn: "Priority placement is on", proOnBody: "Your plan adds paid priority among equally relevant coaches. Relevance comes first.", proNote: "Placement does not guarantee enquiries.",
  results: (n: number) => `${n} ${n === 1 ? "coach" : "coaches"}`, featuredSub: "Coaches on Pro, Team and Studio, listed first.",
  manage: "Your Discovery listing", publish: "Publish in Discovery", privacy: "Publishing is optional and available to adults aged 18 or over. Only your public name, username, introduction, listing details and active offers appear. Enter only the location detail you want to share.",
  tagsHint: "Separate values with commas.", languagesHint: "Use language codes, for example en, pl or de.", locationHint: "Optional, for example a city or country. Your private address is never copied.",
  saved: "Discovery settings saved.", save: "Save listing", withdraw: "Withdraw publication", statusPublished: "Published", statusPrivate: "Unpublished", editProfile: "Edit public profile", subscription: "View plans", previous: "Previous", next: "Next", pagination: "Discovery pages", page: (page: number, count: number | null) => `Page ${page} of ${count ?? "?"}`,
};
