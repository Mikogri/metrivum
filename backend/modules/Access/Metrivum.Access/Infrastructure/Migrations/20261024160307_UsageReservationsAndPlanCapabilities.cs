using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UsageReservationsAndPlanCapabilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT unnest("GrantedFeatures" || ARRAY[
                    'training.builder.advanced','exercises.custom.create','video.analysis.local','video.analysis.cloud',
                    'analytics.advanced','automation.advanced','organization.workspace.manage',
                    'discovery.coaches.search','discovery.coach-profile.publish','discovery.ranking.priority'
                ]::text[])), "Version" = "Version" + 1
                WHERE "Id" = 'v1-default';
                """);
            migrationBuilder.CreateTable(
                name: "usage_reservations",
                schema: "access",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScopeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Operation = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Amount = table.Column<long>(type: "bigint", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Consumer = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_usage_reservations", x => x.Id);
                    table.CheckConstraint("CK_usage_amount", "\"Amount\" >= 0");
                    table.CheckConstraint("CK_usage_status", "\"Status\" IN ('Reserved','Settled','Released')");
                });

            migrationBuilder.CreateIndex(
                name: "IX_usage_reservations_OwnerId_Key_Operation",
                schema: "access",
                table: "usage_reservations",
                columns: new[] { "OwnerId", "Key", "Operation" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_usage_reservations_ScopeId_Key_PeriodStart_Status_ExpiresAt",
                schema: "access",
                table: "usage_reservations",
                columns: new[] { "ScopeId", "Key", "PeriodStart", "Status", "ExpiresAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "usage_reservations",
                schema: "access");
        }
    }
}
