using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Calendar.Migrations
{
    /// <inheritdoc />
    public partial class GuardCalendarRelationshipClient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE calendar."Attendees" DROP CONSTRAINT "FK_Attendee_Relationship";
                ALTER TABLE calendar."Attendees" ADD CONSTRAINT "FK_Attendee_Relationship" FOREIGN KEY ("RelationshipId", "CoachId", "WorkspaceId", "ClientId") REFERENCES coaching."Relationships" ("Id", "CoachId", "WorkspaceId", "ClientId");
                """);
            migrationBuilder.DropIndex(
                name: "IX_Attendees_RelationshipId_CoachId_WorkspaceId",
                schema: "calendar",
                table: "Attendees");

            migrationBuilder.CreateIndex(
                name: "IX_Attendees_RelationshipId_CoachId_WorkspaceId_ClientId",
                schema: "calendar",
                table: "Attendees",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId", "ClientId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE calendar."Attendees" DROP CONSTRAINT "FK_Attendee_Relationship";
                ALTER TABLE calendar."Attendees" ADD CONSTRAINT "FK_Attendee_Relationship" FOREIGN KEY ("RelationshipId", "CoachId", "WorkspaceId") REFERENCES coaching."Relationships" ("Id", "CoachId", "WorkspaceId");
                """);
            migrationBuilder.DropIndex(
                name: "IX_Attendees_RelationshipId_CoachId_WorkspaceId_ClientId",
                schema: "calendar",
                table: "Attendees");

            migrationBuilder.CreateIndex(
                name: "IX_Attendees_RelationshipId_CoachId_WorkspaceId",
                schema: "calendar",
                table: "Attendees",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });
        }
    }
}
