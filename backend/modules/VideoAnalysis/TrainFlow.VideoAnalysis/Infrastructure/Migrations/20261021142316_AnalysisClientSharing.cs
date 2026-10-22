using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.VideoAnalysis.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalysisClientSharing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "SharedWithClient",
                schema: "video_analysis",
                table: "jobs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_jobs_WorkoutExecutionId",
                schema: "video_analysis",
                table: "jobs",
                column: "WorkoutExecutionId",
                filter: "\"SharedWithClient\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_jobs_WorkoutExecutionId",
                schema: "video_analysis",
                table: "jobs");

            migrationBuilder.DropColumn(
                name: "SharedWithClient",
                schema: "video_analysis",
                table: "jobs");
        }
    }
}
