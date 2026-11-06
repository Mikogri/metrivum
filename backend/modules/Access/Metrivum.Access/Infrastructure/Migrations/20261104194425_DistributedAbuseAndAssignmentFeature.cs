using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DistributedAbuseAndAssignmentFeature : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "abuse_windows",
                schema: "access",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Policy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    WindowStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_abuse_windows", x => new { x.UserId, x.Policy });
                    table.CheckConstraint("CK_abuse_count", "\"Count\" >= 0");
                });

            migrationBuilder.CreateIndex(
                name: "IX_abuse_windows_WindowStart",
                schema: "access",
                table: "abuse_windows",
                column: "WindowStart");
            migrationBuilder.Sql("""
                REVOKE ALL ON access.abuse_windows FROM PUBLIC;
                DO $$ BEGIN
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_api') THEN
                        GRANT SELECT, INSERT, UPDATE, DELETE ON access.abuse_windows TO trainflow_api;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'trainflow_worker') THEN
                        REVOKE ALL ON access.abuse_windows FROM trainflow_worker;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON access.abuse_windows FROM anon;
                    END IF;
                    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE ALL ON access.abuse_windows FROM authenticated;
                    END IF;
                END $$;
                """);
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" ||
                    ARRAY['integrations.mcp.assign-programs']::text[]) AS key ORDER BY key),
                    "Version" = "Version" + 1 WHERE "Id" = 'v1-default';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "abuse_windows",
                schema: "access");
        }
    }
}
