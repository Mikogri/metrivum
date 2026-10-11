export const LOCAL_ANALYZER_UNAVAILABLE = 'Local analysis is not yet available: TAPNext++ needs a validated browser export. No server analysis or video upload will be started. Historical results remain available.';
export function requireLocalAnalyzer(): never { throw new Error(LOCAL_ANALYZER_UNAVAILABLE); }
