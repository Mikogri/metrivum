-- Run with psql against a disposable local database. Only temporary data is written.
-- Compare the existing primary key with the reverse block lookup index.
BEGIN;
CREATE TEMP TABLE audit_blocks (
    "UserId" uuid NOT NULL,
    "BlockedUserId" uuid NOT NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("UserId", "BlockedUserId")
);
INSERT INTO audit_blocks ("UserId", "BlockedUserId")
SELECT md5((g % 6000)::text)::uuid, md5((10000 + g)::text)::uuid
FROM generate_series(1, 120000) g;
ANALYZE audit_blocks;

EXPLAIN (ANALYZE, BUFFERS)
SELECT CASE WHEN "UserId" = md5('50')::uuid THEN "BlockedUserId" ELSE "UserId" END
FROM audit_blocks
WHERE "UserId" = md5('50')::uuid OR "BlockedUserId" = md5('50')::uuid;

CREATE INDEX audit_blocks_reverse ON audit_blocks ("BlockedUserId");
ANALYZE audit_blocks;

EXPLAIN (ANALYZE, BUFFERS)
SELECT CASE WHEN "UserId" = md5('50')::uuid THEN "BlockedUserId" ELSE "UserId" END
FROM audit_blocks
WHERE "UserId" = md5('50')::uuid OR "BlockedUserId" = md5('50')::uuid;
ROLLBACK;
