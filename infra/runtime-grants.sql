-- Run after migrations as the migration owner or database administrator.
-- Deliberately no default runtime grants: new tables require an explicit review.
-- Schema access is required in addition to table privileges. Apply as the schema owner.
GRANT USAGE ON SCHEMA accounts, access, exercise_catalog, training, media, video_analysis TO trainflow_api;
GRANT USAGE ON SCHEMA media, video_analysis TO trainflow_worker;

GRANT SELECT, INSERT, UPDATE ON accounts.profiles TO trainflow_api;
GRANT SELECT, INSERT ON accounts.workspaces TO trainflow_api;
GRANT SELECT, INSERT ON accounts.user_roles TO trainflow_api;
-- The EF-owned trigger restricts runtime insertion to Coach; admins use the operational script.

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
GRANT SELECT, UPDATE ON media.files TO trainflow_worker;
GRANT SELECT, UPDATE ON video_analysis.jobs TO trainflow_worker;

DO $$
DECLARE schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['accounts','access','exercise_catalog','training','media','video_analysis'] LOOP
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
