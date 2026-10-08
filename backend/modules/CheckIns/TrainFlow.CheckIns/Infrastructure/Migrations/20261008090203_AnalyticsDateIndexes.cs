using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalyticsDateIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Requests_CoachId_WorkspaceId_AvailableAtUtc",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "CoachId", "WorkspaceId", "AvailableAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Requests_CoachId_WorkspaceId_AvailableAtUtc",
                schema: "checkins",
                table: "Requests");
        }
    }
}
