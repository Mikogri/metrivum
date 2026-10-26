-- Read-only evidence for Discovery indexes. Run with the migration/diagnostic role, never browser credentials.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

SELECT n.nspname AS schema, t.relname AS table_name, c.conname AS foreign_key,
       array_agg(a.attname ORDER BY key.ordinality) AS columns
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS key(attnum, ordinality)
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
WHERE c.contype = 'f' AND n.nspname IN ('accounts','access','coaching','offers','billing','training','exercise_catalog',
    'checkins','calendar','messaging','notifications','media','video_analysis','client_documentation','integrations','forms')
  AND NOT EXISTS (
      SELECT FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indisvalid AND i.indpred IS NULL
        AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey)
GROUP BY n.nspname, t.relname, c.conname ORDER BY 1,2,3;

SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
WHERE (schemaname, tablename) IN (('accounts','profiles'),('accounts','user_roles'),
    ('coaching','DiscoveryProfiles'),('coaching','CoachSpecializations'),
    ('offers','offers'),('billing','platform_subscriptions'),('billing','team_memberships'),
    ('billing','team_platform_subscriptions')) ORDER BY 1,2,3;

SELECT schemaname, relname, n_live_tup, seq_scan, idx_scan
FROM pg_stat_user_tables WHERE schemaname IN ('accounts','coaching','offers','billing')
ORDER BY n_live_tup DESC LIMIT 20;
COMMIT;
