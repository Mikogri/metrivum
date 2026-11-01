-- Read-only metadata inventory. Contains no application row data or role passwords.
SELECT json_build_object('kind','roles','rows',json_agg(json_build_object(
  'name',rolname,'superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole,'createDb',rolcreatedb)))
FROM pg_roles WHERE rolname IN ('trainflow_api','trainflow_worker','trainflow_migrator','anon','authenticated');

SELECT json_build_object('kind','tables','rows',json_agg(json_build_object(
  'schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'workerSelect',has_table_privilege('trainflow_worker',c.oid,'SELECT'),
  'workerWrite',has_table_privilege('trainflow_worker',c.oid,'INSERT,UPDATE,DELETE'),
  'anonSelect',has_table_privilege('anon',c.oid,'SELECT'),
  'authenticatedSelect',has_table_privilege('authenticated',c.oid,'SELECT'),
  'anonWrite',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE'),
  'authenticatedWrite',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE'))))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p','v') AND n.nspname IN
('public','accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins','calendar','messaging','notifications','integrations','documentation');

SELECT json_build_object('kind','definerFunctions','rows',json_agg(json_build_object(
  'schema',n.nspname,'function',p.proname,'resultType',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),
  'searchPath',(SELECT x FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%' LIMIT 1),
  'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
  'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'))))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema');
