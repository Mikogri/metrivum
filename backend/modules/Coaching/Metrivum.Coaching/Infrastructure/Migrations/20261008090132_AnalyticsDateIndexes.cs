using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AnalyticsDateIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Relationships_CoachId_WorkspaceId_StartedAt",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "CoachId", "WorkspaceId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_CoachId_WorkspaceId_CreatedAt",
                schema: "coaching",
                table: "Invitations",
                columns: new[] { "CoachId", "WorkspaceId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Applications_CoachId_WorkspaceId_SubmittedAt",
                schema: "coaching",
                table: "Applications",
                columns: new[] { "CoachId", "WorkspaceId", "SubmittedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Relationships_CoachId_WorkspaceId_StartedAt",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropIndex(
                name: "IX_Invitations_CoachId_WorkspaceId_CreatedAt",
                schema: "coaching",
                table: "Invitations");

            migrationBuilder.DropIndex(
                name: "IX_Applications_CoachId_WorkspaceId_SubmittedAt",
                schema: "coaching",
                table: "Applications");
        }
    }
}
