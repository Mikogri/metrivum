using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachingDefaultFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" || ARRAY[
                    'coaching.clients.view', 'coaching.clients.manage', 'coaching.groups.manage',
                    'coaching.relationships.read-own']::text[]) AS key ORDER BY key), "Version" = "Version" + 1
                WHERE "Id" = 'v1-default';
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Existing operator grants cannot be distinguished from the appended defaults.
            // Retain them on rollback rather than revoke legitimate permissions.


        }
    }
}
