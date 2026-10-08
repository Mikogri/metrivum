-- Run after migrations as the migration owner or database administrator.
-- Deliberately no default runtime grants: new tables require an explicit review.
-- Schema access is required in addition to table privileges. Apply as the schema owner.
DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins'] LOOP
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM trainflow_api, trainflow_worker', schema_name);
        EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM trainflow_api, trainflow_worker', schema_name);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA accounts, access, exercise_catalog, training, media, video_analysis, coaching, forms, offers, billing, checkins TO trainflow_api;
GRANT USAGE ON SCHEMA media, video_analysis TO trainflow_worker;

GRANT SELECT, INSERT, UPDATE ON accounts.profiles TO trainflow_api;
GRANT SELECT, INSERT ON accounts.workspaces TO trainflow_api;
GRANT SELECT, INSERT ON accounts.user_roles TO trainflow_api;
-- The EF-owned trigger restricts runtime insertion to Coach/Client; admins use the operational script.

GRANT SELECT, INSERT, UPDATE, DELETE ON access.configurations, access.assignments, access.overrides, access.flags TO trainflow_api;
GRANT SELECT, INSERT ON access.audit TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON exercise_catalog.exercises, exercise_catalog.tags,
    exercise_catalog.exercise_tags, exercise_catalog.muscles, exercise_catalog.movement_patterns,
    exercise_catalog.exercise_muscles, exercise_catalog.exercise_movement_patterns, exercise_catalog.favorites TO trainflow_api;
GRANT SELECT, INSERT ON exercise_catalog.exercise_revisions TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON training.folders, training.plans, training.formulas, training.imports TO trainflow_api;
GRANT SELECT, INSERT ON training.revisions, training.formula_versions TO trainflow_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON media.files TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON video_analysis.jobs TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON coaching."Relationships", coaching."Groups" TO trainflow_api;
GRANT SELECT, INSERT, DELETE ON coaching."Memberships" TO trainflow_api;
GRANT SELECT, INSERT ON coaching."StatusChanges", coaching."MembershipChanges" TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON forms.templates TO trainflow_api;
GRANT SELECT, INSERT ON forms.versions, forms.submissions, forms.operations TO trainflow_api;
GRANT SELECT ON offers.categories TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON offers.offers TO trainflow_api;
GRANT SELECT, INSERT ON offers.tags, offers.revisions, offers.revision_billing_options TO trainflow_api;
GRANT SELECT, INSERT, DELETE ON offers.billing_options, offers.tag_links TO trainflow_api;
GRANT SELECT, INSERT ON billing.orders, billing.payments, billing.transactions TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON billing.payment_dues, billing.payment_attempts, billing.payment_methods,
    billing.subscriptions, billing.renewal_failures TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON coaching."Applications", coaching."Invitations", coaching."Services" TO trainflow_api;
GRANT SELECT, INSERT ON coaching."ApplicationChanges" TO trainflow_api;
GRANT SELECT, INSERT, UPDATE ON checkins."Schedules", checkins."Requests" TO trainflow_api;
GRANT SELECT, INSERT, DELETE ON checkins."Targets" TO trainflow_api;
-- Billing/CheckIns background jobs run in the API host under trainflow_api.
GRANT SELECT, UPDATE ON media.files TO trainflow_worker;
GRANT SELECT, UPDATE ON video_analysis.jobs TO trainflow_worker;

DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins'] LOOP
        EXECUTE format('REVOKE ALL ON %I."__EFMigrationsHistory" FROM trainflow_api, trainflow_worker', schema_name);
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC', schema_name);
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', schema_name);
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', schema_name);
        END IF;
    END LOOP;
END $$;

DO $$ BEGIN
IF to_regclass('calendar."Events"') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA calendar TO trainflow_api;
    REVOKE ALL ON SCHEMA calendar FROM PUBLIC;
    REVOKE CREATE ON SCHEMA calendar FROM trainflow_api, trainflow_worker;
    GRANT SELECT, INSERT, UPDATE ON calendar."Events" TO trainflow_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON calendar."Attendees" TO trainflow_api;
    GRANT SELECT, INSERT ON calendar."Audit" TO trainflow_api;
    REVOKE ALL ON calendar."__EFMigrationsHistory" FROM trainflow_api, trainflow_worker;
END IF;
END $$;

DO $$ BEGIN
IF to_regclass('messaging."Conversations"') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA messaging TO trainflow_api;
    REVOKE ALL ON SCHEMA messaging FROM PUBLIC;
    REVOKE CREATE ON SCHEMA messaging FROM trainflow_api, trainflow_worker;
    GRANT SELECT, INSERT, UPDATE ON messaging."Conversations", messaging."Members", messaging."Requests" TO trainflow_api;
    GRANT SELECT, INSERT, DELETE ON messaging."Blocks" TO trainflow_api;
    GRANT SELECT, INSERT ON messaging."Messages", messaging."Attachments", messaging."MembershipChanges", messaging."Reports" TO trainflow_api;
    REVOKE UPDATE, DELETE ON messaging."Messages", messaging."Attachments", messaging."MembershipChanges", messaging."Reports" FROM trainflow_api;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='messaging' AND table_name='Messages' AND column_name='DeletedAt') THEN
        GRANT UPDATE ("Body", "ReplyToMessageId", "DeletedAt") ON messaging."Messages" TO trainflow_api;
    END IF;
    REVOKE ALL ON messaging."__EFMigrationsHistory" FROM trainflow_api, trainflow_worker;
    REVOKE ALL ON ALL TABLES IN SCHEMA messaging FROM PUBLIC;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA messaging FROM anon;
        REVOKE ALL ON ALL TABLES IN SCHEMA messaging FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA messaging FROM authenticated;
        REVOKE ALL ON ALL TABLES IN SCHEMA messaging FROM authenticated;
    END IF;
END IF;
END $$;


DO $$ BEGIN
IF to_regclass('notifications."Notifications"') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA notifications TO trainflow_api, trainflow_worker;
    GRANT SELECT, INSERT ON notifications."Notifications" TO trainflow_worker;
    GRANT SELECT ON notifications."Preferences" TO trainflow_worker;
    REVOKE ALL ON SCHEMA notifications FROM PUBLIC;
    REVOKE CREATE ON SCHEMA notifications FROM trainflow_api, trainflow_worker;
    GRANT SELECT, INSERT, UPDATE ON notifications."Notifications", notifications."Preferences" TO trainflow_api;
    REVOKE ALL ON notifications."__EFMigrationsHistory" FROM trainflow_api, trainflow_worker;
    REVOKE ALL ON ALL TABLES IN SCHEMA notifications FROM PUBLIC;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA notifications FROM anon;
        REVOKE ALL ON ALL TABLES IN SCHEMA notifications FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA notifications FROM authenticated;
        REVOKE ALL ON ALL TABLES IN SCHEMA notifications FROM authenticated;
    END IF;
END IF;
END $$;

DO $$ BEGIN
IF to_regclass('billing.platform_plans') IS NOT NULL THEN
    GRANT SELECT ON billing.platform_plans TO trainflow_api;
    GRANT SELECT, INSERT ON billing.plan_prices, billing.plan_changes TO trainflow_api;
    GRANT SELECT, INSERT, UPDATE ON billing.platform_subscriptions TO trainflow_api;
END IF;
END $$;

-- Stage 5 tables are opt-in so this file still works for earlier upgrade checkpoints.
DO $$ BEGIN
IF to_regclass('billing.teams') IS NOT NULL THEN
    GRANT SELECT, INSERT ON billing.teams, billing.team_memberships TO trainflow_api;
    GRANT SELECT, INSERT, UPDATE ON billing.team_requests TO trainflow_api;
    REVOKE ALL ON billing.teams, billing.team_memberships, billing.team_requests FROM PUBLIC, trainflow_worker;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON billing.teams, billing.team_memberships, billing.team_requests FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON billing.teams, billing.team_memberships, billing.team_requests FROM authenticated;
    END IF;
END IF;
END $$;

DO $$ BEGIN
IF to_regclass('training.assignments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON training.assignments, training.workout_occurrences, training.workout_executions TO trainflow_api;
    GRANT SELECT, INSERT ON training.assignment_batches, training.group_assignments, training.assignment_group_sources, training.program_generations TO trainflow_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON training.exercise_executions, training.set_executions TO trainflow_api;
END IF;
IF to_regclass('client_documentation.documents') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA client_documentation TO trainflow_api;
    REVOKE ALL ON SCHEMA client_documentation FROM PUBLIC;
    REVOKE CREATE ON SCHEMA client_documentation FROM trainflow_api, trainflow_worker;
    GRANT SELECT, INSERT, UPDATE ON client_documentation.measurements, client_documentation.coach_notes, client_documentation.documents TO trainflow_api;
    REVOKE ALL ON ALL TABLES IN SCHEMA client_documentation FROM PUBLIC, trainflow_worker;
    REVOKE ALL ON client_documentation."__EFMigrationsHistory" FROM trainflow_api;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON SCHEMA client_documentation FROM anon;
        REVOKE ALL ON ALL TABLES IN SCHEMA client_documentation FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON SCHEMA client_documentation FROM authenticated;
        REVOKE ALL ON ALL TABLES IN SCHEMA client_documentation FROM authenticated;
    END IF;
END IF;
END $$;

-- Organizational subscriptions reuse the API-hosted durable billing worker.
DO $$ BEGIN
IF to_regclass('coaching."TeamClientCases"') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON coaching."TeamClientCases", coaching."TeamCoachAssignments", coaching."ClientTransferRequests" TO trainflow_api;
    GRANT SELECT, INSERT ON coaching."TeamCaseChanges", coaching."TeamTransferChanges" TO trainflow_api;
    REVOKE ALL ON coaching."TeamClientCases", coaching."TeamCoachAssignments", coaching."ClientTransferRequests", coaching."TeamCaseChanges", coaching."TeamTransferChanges" FROM PUBLIC, trainflow_worker;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON coaching."TeamClientCases", coaching."TeamCoachAssignments", coaching."ClientTransferRequests", coaching."TeamCaseChanges", coaching."TeamTransferChanges" FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON coaching."TeamClientCases", coaching."TeamCoachAssignments", coaching."ClientTransferRequests", coaching."TeamCaseChanges", coaching."TeamTransferChanges" FROM authenticated;
    END IF;
END IF;
IF to_regclass('billing.team_platform_subscriptions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON billing.teams, billing.team_memberships, billing.team_requests,
        billing.team_platform_subscriptions, billing.team_billing_quotes TO trainflow_api;
    GRANT SELECT, INSERT ON billing.proration_credits, billing.team_audit TO trainflow_api;
    REVOKE ALL ON billing.team_platform_subscriptions, billing.team_billing_quotes, billing.proration_credits, billing.team_audit FROM PUBLIC, trainflow_worker;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON billing.team_platform_subscriptions, billing.team_billing_quotes, billing.proration_credits, billing.team_audit FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON billing.team_platform_subscriptions, billing.team_billing_quotes, billing.proration_credits, billing.team_audit FROM authenticated;
    END IF;
END IF;
END $$;
