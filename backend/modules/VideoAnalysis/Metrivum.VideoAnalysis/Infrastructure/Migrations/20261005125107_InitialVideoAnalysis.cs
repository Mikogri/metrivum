using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialVideoAnalysis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "video_analysis");

            migrationBuilder.CreateTable(
                name: "jobs",
                schema: "video_analysis",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    MediaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    Tags = table.Column<string[]>(type: "text[]", nullable: false),
                    Configuration = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Result = table.Column<string>(type: "jsonb", nullable: true),
                    FailureCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LeaseExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LeaseToken = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_jobs", x => x.Id);
                    table.CheckConstraint("ck_job_attempts", "\"Attempts\" >= 0");
                    table.CheckConstraint("ck_job_lease", "(\"Status\" = 'Processing') = (\"LeaseToken\" IS NOT NULL AND \"LeaseExpiresAt\" IS NOT NULL)");
                    table.CheckConstraint("ck_job_result", "(\"Status\" = 'Completed') = (\"Result\" IS NOT NULL)");
                    table.CheckConstraint("ck_job_status", "\"Status\" IN ('Queued', 'Processing', 'Completed', 'Failed', 'Cancelled')");
                });

            migrationBuilder.CreateIndex(
                name: "IX_jobs_OwnerId_CreatedAt_Id",
                schema: "video_analysis",
                table: "jobs",
                columns: new[] { "OwnerId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_jobs_OwnerId_IdempotencyKey",
                schema: "video_analysis",
                table: "jobs",
                columns: new[] { "OwnerId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_jobs_Status_AvailableAt_CreatedAt_Id",
                schema: "video_analysis",
                table: "jobs",
                columns: new[] { "Status", "AvailableAt", "CreatedAt", "Id" });
            // New private schema tables use API-enforced ownership and restricted database roles.
            migrationBuilder.Sql("ALTER TABLE video_analysis.jobs DISABLE ROW LEVEL SECURITY;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "jobs",
                schema: "video_analysis");
        }
    }
}
