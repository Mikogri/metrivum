using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Integrations.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ApprovedProgramAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Action_Execution",
                schema: "integrations",
                table: "PendingActions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Action_Type",
                schema: "integrations",
                table: "PendingActions");

            migrationBuilder.AddColumn<Guid>(
                name: "AssignmentId",
                schema: "integrations",
                table: "PendingActions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Action_Execution",
                schema: "integrations",
                table: "PendingActions",
                sql: "(\"Status\" <> 'Executed') OR (\"ExecutedAt\" IS NOT NULL AND ((\"Type\" = 'SendMessage' AND \"MessageId\" IS NOT NULL AND \"AssignmentId\" IS NULL) OR (\"Type\" = 'AssignProgram' AND \"AssignmentId\" IS NOT NULL AND \"MessageId\" IS NULL)))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Action_Type",
                schema: "integrations",
                table: "PendingActions",
                sql: "\"Type\" IN ('SendMessage','AssignProgram')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Action_Execution",
                schema: "integrations",
                table: "PendingActions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Action_Type",
                schema: "integrations",
                table: "PendingActions");

            migrationBuilder.DropColumn(
                name: "AssignmentId",
                schema: "integrations",
                table: "PendingActions");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Action_Execution",
                schema: "integrations",
                table: "PendingActions",
                sql: "(\"Status\" <> 'Executed') OR (\"ExecutedAt\" IS NOT NULL AND \"MessageId\" IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Action_Type",
                schema: "integrations",
                table: "PendingActions",
                sql: "\"Type\" = 'SendMessage'");
        }
    }
}
