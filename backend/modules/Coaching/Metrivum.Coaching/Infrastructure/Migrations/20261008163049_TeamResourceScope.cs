using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamResourceScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Relationships_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Relationship_Source",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.AddColumn<Guid>(
                name: "TeamClientCaseId",
                schema: "coaching",
                table: "Services",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "coaching",
                table: "Services",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamClientCaseId",
                schema: "coaching",
                table: "Relationships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "coaching",
                table: "Relationships",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "coaching",
                table: "Invitations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TeamConsentAt",
                schema: "coaching",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamConsentVersion",
                schema: "coaching",
                table: "Applications",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "coaching",
                table: "Applications",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Services_TeamId_CoachId_StartedAt",
                schema: "coaching",
                table: "Services",
                columns: new[] { "TeamId", "CoachId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "CoachId", "ClientId" },
                unique: true,
                filter: "\"TeamId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "TeamClientCaseId", "TeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_TeamId_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "TeamId", "CoachId", "ClientId" },
                unique: true,
                filter: "\"TeamId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Relationship_Scope",
                schema: "coaching",
                table: "Relationships",
                sql: "(\"TeamId\" IS NULL) = (\"TeamClientCaseId\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Relationship_Source",
                schema: "coaching",
                table: "Relationships",
                sql: "\"ActivationSource\" IN ('DevFixture','AcceptedApplication','TeamConsent')");

            migrationBuilder.CreateIndex(
                name: "IX_Applications_TeamId_CoachId_SubmittedAt",
                schema: "coaching",
                table: "Applications",
                columns: new[] { "TeamId", "CoachId", "SubmittedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_Relationships_TeamClientCases_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "TeamClientCaseId", "TeamId" },
                principalSchema: "coaching",
                principalTable: "TeamClientCases",
                principalColumns: new[] { "Id", "TeamId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Relationships_TeamClientCases_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropIndex(
                name: "IX_Services_TeamId_CoachId_StartedAt",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_Relationships_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropIndex(
                name: "IX_Relationships_TeamClientCaseId_TeamId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropIndex(
                name: "IX_Relationships_TeamId_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Relationship_Scope",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Relationship_Source",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropIndex(
                name: "IX_Applications_TeamId_CoachId_SubmittedAt",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "TeamClientCaseId",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "coaching",
                table: "Services");

            migrationBuilder.DropColumn(
                name: "TeamClientCaseId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "coaching",
                table: "Relationships");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "coaching",
                table: "Invitations");

            migrationBuilder.DropColumn(
                name: "TeamConsentAt",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "TeamConsentVersion",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_CoachId_ClientId",
                schema: "coaching",
                table: "Relationships",
                columns: new[] { "CoachId", "ClientId" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Relationship_Source",
                schema: "coaching",
                table: "Relationships",
                sql: "\"ActivationSource\" IN ('DevFixture','AcceptedApplication')");
        }
    }
}
