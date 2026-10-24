# Mobile backend

## Local analysis results

`POST /api/v1/analyses/client-results` requires an active onboarded account and an `Idempotency-Key` (1–100 characters). Client accounts may save and read their own local results; Coach accounts keep existing feature checks. This grants no Coach capability to a Client. The server does not run inference or mark submitted measurements as verified.

The request is `SaveClientAnalysisRequest`:

```json
{
  "localAnalysisId": "b97bcf2f-4b87-4ae5-97a3-a733714c8f17",
  "executionLocation": "client",
  "name": "Squat",
  "note": null,
  "tags": [],
  "configuration": { "movement": "squat", "metersPerPixel": null },
  "sourceVideo": { "origin": "local", "durationSeconds": 10, "width": 1920, "height": 1080 },
  "mediaId": null,
  "workoutExecutionId": null,
  "setId": null,
  "result": {
    "schemaVersion": 1,
    "engineVersion": "runtime-version",
    "modelVersion": "model-version",
    "method": "tracking",
    "positionUnit": "px",
    "metersPerPixel": null,
    "repetitions": [],
    "trajectory": [{ "seconds": 0, "x": 100, "y": 200, "velocity": null, "quality": 1, "occluded": false }],
    "warnings": []
  }
}
```

`sourceVideo.origin` describes storage: `local` requires no `mediaId`; `cloud` requires an owned ready video. No device path, public URL, frames or video bytes belong in this request. Without cloud media, display **Source video is not stored in cloud** and offer no playback on another device.

Limits reuse Analysis options (default 50,000 trajectory points / 8 MiB serialized result), plus 4 hours source duration, 16,384 pixel dimensions, 1,000 repetitions and 20 phases per repetition. The API host also caps the complete HTTP request at 2 MiB, so the stricter request bound applies to ingestion. Numbers must be finite; timestamps must be ordered, nonnegative and within duration. Calibration must match units. Metadata and nested arrays are bounded. Optional workout references must belong to the authenticated athlete and pass the existing relationship read policy. `setId` is the persisted actual set `id` returned in workout execution data, not `prescribedSetId`. A later workout edit can replace its sets: an old result retains the submitted reference but does not rewrite execution or activity.

Owner + idempotency key and owner + local analysis ID prevent duplicate persistence. Reusing either for different content returns 409. Saving a result never completes a workout or logs a load. `GET /api/v1/analyses/`, `/{id}` and `/{id}/result` retain existing shapes with additive provenance fields; `mediaId` is now nullable. A Client sees only their own client-provenance records. Historical server jobs remain readable for Coaches and remain in the original table; no jobs are resubmitted or deleted.

New applications should call only the client-result endpoint for new local analyses. The legacy server queue and analyzer are unchanged for compatibility. Any future drain/retirement must stop admission deliberately, inspect pending jobs, and leave the shared notification/billing/check-in worker enabled.

## Expo push transport

Authenticated routes:

- `PUT /api/v1/me/notifications/devices/{installationId}` with `{ "expoPushToken": "ExpoPushToken[...]", "platform": "ios", "enabled": true, "activeConversationId": null }`; returns `{ installationId, platform, enabled }`.
- `DELETE /api/v1/me/notifications/devices/{installationId}` removes only the current account binding and its pending transport records. Call before revoking that account session. Repeat deletion safely if necessary.

Use a random installation UUID retained on the device. Each account registers independently; a token may legitimately serve multiple signed-in accounts. On token rotation, refresh every retained account binding using that account's authenticated transport. Registration never transfers another account's binding. Maximum 20 installations per account. A permission refusal may leave no registration or set `enabled=false` and does not affect messaging REST/SignalR.

While a conversation is open, re-register that account with `activeConversationId` at least every 60 seconds; suppression expires after 90 seconds. Clear it on close/background. Only that installation/account is suppressed. Existing notification preferences, account status and source-module delivery policies are checked again before sending. Push delivery never marks anything read.

Enable explicitly in API/worker configuration:

```text
Notifications__ExpoPush__Enabled=true
Notifications__ExpoPush__AccessToken=<server secret, if Expo enhanced push security is enabled>
```

Default is disabled; registration endpoints still work. Configure EAS/APNs/FCM credentials for the actual app project separately. No credentials were provisioned and no real provider/device delivery was performed in this change. The transport uses the fixed HTTPS Expo endpoint, generic lockscreen text, and only `{ notificationId, accountId, resourceType, resourceId }` in data. It never includes message bodies, check-in answers, health data, deep links or signed URLs. On tap, select/login to `accountId` deliberately, then fetch the authorized resource through REST.

Transport rows are children of the existing notification and device records, not a second business notification store. Successful tickets are polled after 15 minutes; `DeviceNotRegistered` disables bindings for that token without invalidating a newly rotated token. HTTP failures and rate errors retry with bounded attempts; missing receipts expire after 23 hours. `AcceptedByProvider` means Expo/APNs/FCM accepted the handoff, not device delivery or a read receipt. Network uncertainty can duplicate a hint, so clients deduplicate by notification ID. An already submitted provider notification cannot be recalled on logout. API unavailable during logout requires best-effort deletion/retry; the lockscreen payload stays generic.

Official references: [sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [credential/setup requirements](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Migrations and verification

EF migrations `20261010155332_ClientAnalysisResults` and `20261010155339_MobilePushTransport` are additive: nullable source media + provenance on existing analysis jobs, device bindings and transport receipts. Applied to local PostgreSQL and, after reviewing the generated SQL and exact predecessors, to the previously confirmed Supabase DEV project `atclvdkpbccafakzpwls` on 2026-10-10. No auth/storage schema, production, commit or Git push operation was performed. Do not downgrade after storing local results.

Tests use `.local/mobile-backend-build` to avoid the running API's outputs. Local PostgreSQL test connection is supplied through `TRAINFLOW_TEST_DATABASE`; do not log it. The API, ownership and receipt tests use real PostgreSQL, with a fake HTTP provider for push. These tests do not prove inference on a phone/browser or delivery to a device.

Verified locally: 217 unit tests, 2 architecture tests, 4 new mobile PostgreSQL integration tests, 31 media/notification/training regressions, and the account-revocation integration test passed. The notification worker tests use an isolated nonparallel collection because multiple test hosts share the same database queue. Shared HTTP transport regressions: 20 passed, including abort/timeout during response-body reads.

### DEV migration review and application

Read-only connector verification on 2026-10-10 confirmed the user-designated DEV project `atclvdkpbccafakzpwls`, Metrivum, `eu-west-1`, `ACTIVE_HEALTHY`, database host `db.atclvdkpbccafakzpwls.supabase.co`. The verified predecessor EF heads were `20261005125107_InitialVideoAnalysis` and `20261008103734_QueryPerformanceIndexes`. Both mobile migrations and their target tables were absent before application.

Prepared `.local/mobile/dev-migrations.sql` contains only the two EF-generated idempotent deltas, their original EF-history inserts, predecessor/role/privacy guards, and narrowly scoped operational grants. It executes as `trainflow_migrator`, the existing schema/table owner. The reviewed script was applied successfully through the Supabase migration connector as `ef_mobile_client_results_and_push`. EF remains the schema source of truth; the connector executed its generated deltas and original module-history records. Script SHA-256: `A26A89135E7FEAF0B01BD8144D5C4FC3F26698AD01CC10F1F1835D942BA06C1E`.

Live privilege audit: the two module schemas deny `anon`/`authenticated` schema usage; the existing tables have RLS disabled, use explicit runtime grants, and have no default grants. `trainflow_api` and `trainflow_worker` are neither superusers nor RLS-bypass/database/role creators. The prepared script preserves that private-schema model without adding Data API exposure or new RLS policies. New device records grant API-only SELECT/INSERT/UPDATE/DELETE; transport rows grant API-only SELECT/INSERT/UPDATE. The API-hosted notification sender uses these grants. The separate analysis/storage worker receives no device-token access. Existing analysis table grants cover the added columns, and EF history stays inaccessible to runtime mutation.

Local reproduction: `.local/mobile/verify-dev-migrations.ps1` built a disposable database from the exact predecessors, applied the prepared script twice, and verified restricted API registration/delivery writes, logout cascade, five total module EF-history rows, and denied browser/worker token reads. Result: `MOBILE_MIGRATION_REVIEW_OK`. The disposable database and test-only roles were removed. The grants are also recorded in `infra/runtime-grants.sql` for fresh environments. Post-application checks confirmed both EF histories, nullable source media and narrow grants. A transaction using the actual restricted `trainflow_api` DEV connection successfully inserted, read, updated and deleted a device binding, then rolled back; no test binding remains. The browser and separate worker roles have no token-table access. The API/worker must be restarted with the new binary before using these endpoints.
