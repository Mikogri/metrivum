/** User ids signed out on purpose, so the session watcher doesn't report them as expired. */
export const userInitiatedSignOuts = new Set<string>();
