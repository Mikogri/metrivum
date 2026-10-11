using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientAnalysisResults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "MediaId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "ExecutionLocation",
                schema: "video_analysis",
                table: "jobs",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "server");

            migrationBuilder.AddColumn<Guid>(
                name: "LocalAnalysisId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SetId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceVideo",
                schema: "video_analysis",
                table: "jobs",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "WorkoutExecutionId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_jobs_OwnerId_LocalAnalysisId",
                schema: "video_analysis",
                table: "jobs",
                columns: new[] { "OwnerId", "LocalAnalysisId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_jobs_OwnerId_LocalAnalysisId",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "ExecutionLocation",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "LocalAnalysisId",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "SetId",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "SourceVideo",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "WorkoutExecutionId",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.AlterColumn<Guid>(
                name: "MediaId",
                schema: "video_analysis",
                table: "jobs",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
