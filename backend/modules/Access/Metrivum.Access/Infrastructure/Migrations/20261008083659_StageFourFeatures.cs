using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageFourFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" || ARRAY['analytics.view']::text[]) AS key ORDER BY key),
                    "Version" = "Version" + 1
                WHERE "Id" = 'v1-default';
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
