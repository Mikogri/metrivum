-- psql -X -v ON_ERROR_STOP=1 --file infra/diagnostics/consistency.sql
-- Supply connection settings through PG* / PGSERVICE, never commit credentials.
-- Counts are a consistent snapshot, not a repair instruction. A timeout means incomplete.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '20s';

WITH checks AS (
    SELECT 'accepted_application_service' AS rule, 'error' AS severity, 'coaching' AS scope,
           count(*) AS affected_count, min(a."Id"::text) AS sample_id,
           'Accepted application must have exactly one service with matching owner/client/workspace; review acceptance audit, never invent consent.' AS action
    FROM coaching."Applications" a
    WHERE a."Status" = 'Accepted' AND
      (SELECT count(*) FROM coaching."Services" s WHERE s."ApplicationId" = a."Id"
         AND s."CoachId" = a."CoachId" AND s."ClientId" = a."ApplicantUserId" AND s."WorkspaceId" = a."WorkspaceId") <> 1
    UNION ALL
    SELECT 'checkin_form_version', 'error', 'checkins', count(*), min(r."Id"::text),
           'Request form version is missing; recover the exact published version from backup, do not substitute latest.'
    FROM checkins."Requests" r LEFT JOIN forms.versions v ON v."Id" = r."FormVersionId"
    WHERE v."Id" IS NULL
    UNION ALL
    SELECT 'checkin_submission_identity', 'error', 'checkins', count(*), min(r."Id"::text),
           'Submission must match request version and respondent; investigate transaction/audit without rewriting answers.'
    FROM checkins."Requests" r LEFT JOIN forms.submissions s ON s."Id" = r."FormSubmissionId"
    WHERE r."FormSubmissionId" IS NOT NULL AND
      (s."Id" IS NULL OR s."FormVersionId" <> r."FormVersionId" OR s."RespondentId" <> r."ClientId")
    UNION ALL
    SELECT 'settled_due_payment', 'error', 'billing', count(*), min(d."Id"::text),
           'Settled due must match its historical payment; reconcile records, never recalculate using current prices.'
    FROM billing.payment_dues d LEFT JOIN billing.payments p ON p."DueId" = d."Id"
    WHERE d."Status" IN ('Paid', 'PaidExternally', 'Free') AND
      (p."Id" IS NULL OR p."GrossAmount" <> d."Amount" OR p."Currency" <> d."Currency"
       OR p."FeeAmount" <> d."FeeAmount" OR p."CoachNetAmount" <> d."CoachNetAmount")
    UNION ALL
    SELECT 'assignment_revision', 'error', 'training', count(*), min(a."Id"::text),
           'Assignment must reference preserved original/effective revisions; restore missing sources, do not republish latest.'
    FROM training.assignments a
    LEFT JOIN training.revisions original ON original."Id" = a."OriginalRevisionId"
    LEFT JOIN training.revisions effective ON effective."Id" = a."EffectiveRevisionId"
    WHERE original."Id" IS NULL OR effective."Id" IS NULL
    UNION ALL
    SELECT 'document_media_reference', 'error', 'client_documentation', count(*), min(d."Id"::text),
           'Document Media row is missing; restore metadata and separately verify private Storage object inventory.'
    FROM client_documentation.documents d LEFT JOIN media.files m ON m."Id" = d."MediaId"
    WHERE d."MediaId" IS NOT NULL AND m."Id" IS NULL
    UNION ALL
    SELECT 'notification_delivery_lag', 'warning', 'notifications', count(*), min(n."Id"::text),
           'Due notification remains undelivered after 15 minutes; inspect worker health and current recipient access before replay.'
    FROM notifications."Notifications" n
    WHERE n."DeliveredAt" IS NULL AND NOT n."Cancelled" AND n."AvailableAt" < now() - interval '15 minutes'
    UNION ALL
    SELECT 'checkin_schedule_lag', 'warning', 'checkins', count(*), min(s."Id"::text),
           'Active schedule is over 15 minutes behind; inspect retries, relationships and scheduler health; do not create requests manually.'
    FROM checkins."Schedules" s
    WHERE s."Status" = 'Active' AND s."NextAvailableAtUtc" < now() - interval '15 minutes'
    UNION ALL
    SELECT 'team_dissolution_lag', 'warning', 'billing', count(*), min(t."Id"::text),
           'Scheduled dissolution is over 15 minutes behind; inspect durable lifecycle before explicitly resuming billing worker.'
    FROM billing.teams t WHERE t."Status" = 'DissolutionScheduled' AND t."DissolutionAt" < now() - interval '15 minutes'
    UNION ALL
    SELECT 'legacy_analysis_expired_lease', 'warning', 'video_analysis', count(*), min(j."Id"::text),
           'Legacy analysis lease expired over 15 minutes ago; inspect historical jobs, do not enable server ML as a local-ML fallback.'
    FROM video_analysis.jobs j
    WHERE j."Status" = 'Processing' AND j."LeaseExpiresAt" < now() - interval '15 minutes'
)
SELECT rule, severity, scope, affected_count, sample_id, action, transaction_timestamp() AS checked_at
FROM checks ORDER BY rule;
ROLLBACK;
