using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class OptionalApplicationForm : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Application_Submission",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.AlterColumn<Guid>(
                name: "FormVersionId",
                schema: "coaching",
                table: "Applications",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Application_OptionalForm",
                schema: "coaching",
                table: "Applications",
                sql: "\"FormVersionId\" IS NOT NULL OR (\"FormSubmissionId\" IS NULL AND \"Answers\" = '{}'::jsonb)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Application_Submission",
                schema: "coaching",
                table: "Applications",
                sql: "\"Status\" NOT IN ('Submitted','Accepted','Rejected') OR (\"SubmittedAt\" IS NOT NULL AND (\"FormVersionId\" IS NULL OR \"FormSubmissionId\" IS NOT NULL))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Application_OptionalForm",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Application_Submission",
                schema: "coaching",
                table: "Applications");

            migrationBuilder.AlterColumn<Guid>(
                name: "FormVersionId",
                schema: "coaching",
                table: "Applications",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Application_Submission",
                schema: "coaching",
                table: "Applications",
                sql: "\"Status\" NOT IN ('Submitted','Accepted','Rejected') OR (\"SubmittedAt\" IS NOT NULL AND \"FormSubmissionId\" IS NOT NULL)");
        }
    }
}
