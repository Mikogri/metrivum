-- Connect as the restricted runtime role. All fixture rows are rolled back.
BEGIN;
DO $$
DECLARE blocker uuid := gen_random_uuid(); blocked uuid := gen_random_uuid();
BEGIN
    IF current_user <> 'trainflow_api' THEN
        RAISE EXCEPTION 'Use the actual restricted API connection';
    END IF;
    INSERT INTO messaging."Blocks" ("UserId", "BlockedUserId", "CreatedAt") VALUES (blocker, blocked, now());
    IF NOT EXISTS (SELECT FROM messaging."Blocks" WHERE "BlockedUserId" = blocked AND "UserId" = blocker) THEN
        RAISE EXCEPTION 'Runtime reverse block lookup failed';
    END IF;
    IF has_table_privilege(current_user, 'messaging."__EFMigrationsHistory"', 'INSERT') THEN
        RAISE EXCEPTION 'Runtime must not write migration history';
    END IF;
END $$;
ROLLBACK;
SELECT 'Restricted runtime insert/reverse lookup verified; fixture rolled back' AS verification;
