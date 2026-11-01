using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GuardServiceRelationshipClient : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Services_Relationships_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_Services_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Services");

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Relationships_Id_CoachId_WorkspaceId_ClientId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "Id", "CoachId", "WorkspaceId", "ClientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Services_RelationshipId_CoachId_WorkspaceId_ClientId",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId", "ClientId" });

            migrationBuilder.AddForeignKey(
                name: "FK_Services_Relationships_RelationshipId_CoachId_WorkspaceId_C~",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId", "ClientId" },
                principalSchema: "coaching",
                principalTable: "Relationships",
                principalColumns: new[] { "Id", "CoachId", "WorkspaceId", "ClientId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Services_Relationships_RelationshipId_CoachId_WorkspaceId_C~",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_Services_RelationshipId_CoachId_WorkspaceId_ClientId",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_Relationships_Id_CoachId_WorkspaceId_ClientId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.CreateIndex(
                name: "IX_Services_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" });

            migrationBuilder.AddForeignKey(
                name: "FK_Services_Relationships_RelationshipId_CoachId_WorkspaceId",
                schema: "coaching",
                table: "Services",
                columns: new[] { "RelationshipId", "CoachId", "WorkspaceId" },
                principalSchema: "coaching",
                principalTable: "Relationships",
                principalColumns: new[] { "Id", "CoachId", "WorkspaceId" },
                onDelete: ReferentialAction.Restrict);
        }
    }
}
