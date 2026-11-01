using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Metrivum.Access.Infrastructure.Migrations;

[DbContext(typeof(AccessDbContext))]
[Migration("20261014160000_IntegrationFeatures")]
public sealed class IntegrationFeatures : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        UPDATE access.configurations
        SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" || ARRAY[
            'integrations.mcp.connect','integrations.mcp.read-training','integrations.mcp.write-training-drafts',
            'integrations.mcp.read-clients','integrations.mcp.read-checkins','integrations.mcp.manage-checkins',
            'integrations.mcp.read-messages','integrations.mcp.prepare-message','integrations.mcp.send-approved-message',
            'integrations.mcp.read-analytics','integrations.mcp.read-calendar']::text[]) AS key ORDER BY key),
            "Version" = "Version" + 1 WHERE "Id" = 'v1-default';
        """);
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
