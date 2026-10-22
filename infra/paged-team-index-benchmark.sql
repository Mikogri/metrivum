-- Run only against a disposable local PostgreSQL database using psql -v ON_ERROR_STOP=1.
-- Temporary tables keep this synthetic benchmark separate from application data.
BEGIN;
CREATE TEMP TABLE page_cases ("Id" uuid, "TeamId" uuid, "ClientId" uuid, "Status" text, "CreatedAt" timestamptz);
INSERT INTO page_cases
SELECT md5(g::text)::uuid, md5((g / 12000)::text)::uuid, md5((g % 10)::text)::uuid,
       CASE WHEN g % 3 = 0 THEN 'Ended' ELSE 'Active' END,
       timestamptz '2026-01-01' + (g % 1000) * interval '1 minute'
FROM generate_series(1,120000) g;
CREATE INDEX old_team_status_date ON page_cases ("TeamId", "Status", "CreatedAt");
CREATE INDEX old_client_status_date ON page_cases ("ClientId", "Status", "CreatedAt");
ANALYZE page_cases;
\echo Team/client lists BEFORE
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_cases WHERE "TeamId" = md5('1')::uuid ORDER BY "CreatedAt" DESC, "Id" LIMIT 25;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_cases WHERE "ClientId" = md5('1')::uuid ORDER BY "CreatedAt" DESC, "Id" LIMIT 25;
CREATE INDEX new_team_date_id ON page_cases ("TeamId", "CreatedAt" DESC, "Id");
CREATE INDEX new_client_date_id ON page_cases ("ClientId", "CreatedAt" DESC, "Id");
\echo Team/client lists AFTER
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_cases WHERE "TeamId" = md5('1')::uuid ORDER BY "CreatedAt" DESC, "Id" LIMIT 25;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_cases WHERE "ClientId" = md5('1')::uuid ORDER BY "CreatedAt" DESC, "Id" LIMIT 25;
CREATE TEMP TABLE page_members ("TeamId" uuid, "UserId" uuid, "JoinedAt" timestamptz, "Status" text);
INSERT INTO page_members SELECT "TeamId", "Id", "CreatedAt", "Status" FROM page_cases;
CREATE UNIQUE INDEX old_member_key ON page_members ("TeamId", "UserId");
ANALYZE page_members;
\echo Active members BEFORE
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_members WHERE "TeamId" = md5('1')::uuid AND "Status" = 'Active' ORDER BY "JoinedAt", "UserId" LIMIT 25;
CREATE INDEX new_active_members ON page_members ("TeamId", "JoinedAt", "UserId") WHERE "Status" = 'Active';
\echo Active members AFTER
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM page_members WHERE "TeamId" = md5('1')::uuid AND "Status" = 'Active' ORDER BY "JoinedAt", "UserId" LIMIT 25;
ROLLBACK;
