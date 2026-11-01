using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class IndexCheckInForeignKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Targets_GroupId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Targets",
                columns: new[] { "GroupId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Targets_RelationshipId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Targets",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_Schedules_FormTemplateId",
                schema: "checkins",
                table: "Schedules",
                column: "FormTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_FormVersionId",
                schema: "checkins",
                table: "Requests",
                column: "FormVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_Requests_RelationshipId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Requests",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Targets_GroupId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Targets");

            migrationBuilder.DropIndex(
                name: "IX_Targets_RelationshipId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Targets");

            migrationBuilder.DropIndex(
                name: "IX_Schedules_FormTemplateId",
                schema: "checkins",
                table: "Schedules");

            migrationBuilder.DropIndex(
                name: "IX_Requests_FormVersionId",
                schema: "checkins",
                table: "Requests");

            migrationBuilder.DropIndex(
                name: "IX_Requests_RelationshipId_CoachId_WorkspaceId",
                schema: "checkins",
                table: "Requests");
        }
    }
}
