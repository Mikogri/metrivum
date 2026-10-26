using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CloudGpuBudget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CloudBudgetOperation",
                schema: "video_analysis",
                table: "jobs",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "CloudBudgetSeconds",
                schema: "video_analysis",
                table: "jobs",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_job_cloud_budget",
                schema: "video_analysis",
                table: "jobs",
                sql: "(\"CloudBudgetOperation\" IS NULL AND \"CloudBudgetSeconds\" IS NULL) OR (\"CloudBudgetOperation\" IS NOT NULL AND \"CloudBudgetSeconds\" > 0 AND \"CloudBudgetSeconds\" <= 3600)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_job_cloud_budget",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "CloudBudgetOperation",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "CloudBudgetSeconds",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "video_analysis",
                table: "jobs");
        }
    }
}
