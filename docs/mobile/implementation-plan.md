# Mobile delivery plan

Source: [user specification](product-spec.md). Implementation is authorized; no store publication, paid service, production deployment or push.

## Architecture

Use Expo stable, native stacks/tabs behind one adapter, a mobile-only UI theme and generated neutral API types. ASP.NET remains authoritative for ownership, capabilities, billing and training rules. Supabase is authentication only. Device sessions and draft encryption keys live in SecureStore; private drafts use SQLCipher. Capture identity for every operation; mount a separate query cache per active account. One serial write queue per workout/check-in; finishing drains it, conflicts preserve local work. Mobile has no payment mutations or payment redirects.

The existing Python model must prove actual portability before binding UI to an ONNX runtime. Keep historical results; never silently substitute tracking or send new local inference to a server. Missing model/runtime/device support blocks only that milestone.

## Tasks and ownership

1. Audit current contracts, SDK support, model and native toolchains; record screen/API map and explicit blockers.
2. Root: Expo workspace, UI theme/components, secure multi-account sessions, neutral transport, persistence and navigation. Test account isolation, callback validation, encrypted draft lifecycle and serial write queue.
3. Backend implementer: additive local-analysis result ingestion and mobile push registration/delivery in existing modules, with security/validation tests. No cloud mutation without parent review.
4. Mobile feature implementer: Client plans/workout/history/check-ins and Coach clients/intake/details, using root infrastructure and existing API. Test execution drain/conflicts; no program/form builder.
5. Root: messaging, calendar, settings, read-only billing, foreground realtime and push/deep-link integration.
6. Integrate proven local ML when feasible; otherwise preserve history and provide explicit unsupported state, never mock measurements or server fallback.
7. Run relevant .NET/web regressions, mobile typecheck, Expo dependency/config/bundle checks and native build/device tests only where toolchains exist. Record unverified iOS/device behavior explicitly. Refresh Graphify; concise documentation of setup, privacy, theming, endpoints and release gaps.

Existing dirty changes are preserved. Milestones stay reviewable through scoped files and this record; no blanket staging.
