using Npgsql;

namespace TrainFlow.Api.Security;

public static class RuntimeDatabaseGuard
{
    public static async Task ValidateAsync(NpgsqlDataSource database, CancellationToken cancellationToken)
    {
        await using var command = database.CreateCommand("""
            SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
                OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN
                    ('accounts','access','exercise_catalog','training','media','video_analysis','coaching','forms','offers','billing','checkins','calendar','messaging','notifications','client_documentation','integrations')
                    AND has_schema_privilege(current_user, n.oid, 'CREATE'))
                OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname IN ('auth','storage','realtime') AND c.relkind IN ('r','p')
                    AND has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
            FROM pg_roles r WHERE r.rolname = current_user
            """);
        if (await command.ExecuteScalarAsync(cancellationToken) is not false)
            throw new InvalidOperationException("The runtime database role has administrative or DDL privileges. Apply the restricted runtime grants.");
    }
}
