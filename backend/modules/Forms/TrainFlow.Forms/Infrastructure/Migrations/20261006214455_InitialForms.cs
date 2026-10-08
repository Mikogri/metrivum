using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Forms.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialForms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "forms");

            migrationBuilder.CreateTable(
                name: "operations",
                schema: "forms",
                columns: table => new
                {
                    SourceTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    ResultTemplateId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_operations", x => new { x.SourceTemplateId, x.Key });
                });

            migrationBuilder.CreateTable(
                name: "submissions",
                schema: "forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FormVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RespondentId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Answers = table.Column<string>(type: "jsonb", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_submissions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "templates",
                schema: "forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Draft = table.Column<string>(type: "jsonb", nullable: false),
                    CurrentPublishedVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_templates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "versions",
                schema: "forms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoachId = table.Column<Guid>(type: "uuid", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Definition = table.Column<string>(type: "jsonb", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    DraftVersion = table.Column<long>(type: "bigint", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_versions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_versions_templates_TemplateId",
                        column: x => x.TemplateId,
                        principalSchema: "forms",
                        principalTable: "templates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_operations_ResultTemplateId",
                schema: "forms",
                table: "operations",
                column: "ResultTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_submissions_FormVersionId",
                schema: "forms",
                table: "submissions",
                column: "FormVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_submissions_SourceKey",
                schema: "forms",
                table: "submissions",
                column: "SourceKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_templates_CoachId_Purpose_Archived_UpdatedAt",
                schema: "forms",
                table: "templates",
                columns: new[] { "CoachId", "Purpose", "Archived", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_templates_CurrentPublishedVersionId",
                schema: "forms",
                table: "templates",
                column: "CurrentPublishedVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_versions_TemplateId_DraftVersion",
                schema: "forms",
                table: "versions",
                columns: new[] { "TemplateId", "DraftVersion" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_versions_TemplateId_Number",
                schema: "forms",
                table: "versions",
                columns: new[] { "TemplateId", "Number" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_operations_templates_ResultTemplateId",
                schema: "forms",
                table: "operations",
                column: "ResultTemplateId",
                principalSchema: "forms",
                principalTable: "templates",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_operations_templates_SourceTemplateId",
                schema: "forms",
                table: "operations",
                column: "SourceTemplateId",
                principalSchema: "forms",
                principalTable: "templates",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_submissions_versions_FormVersionId",
                schema: "forms",
                table: "submissions",
                column: "FormVersionId",
                principalSchema: "forms",
                principalTable: "versions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_templates_versions_CurrentPublishedVersionId",
                schema: "forms",
                table: "templates",
                column: "CurrentPublishedVersionId",
                principalSchema: "forms",
                principalTable: "versions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                CREATE FUNCTION forms.reject_immutable_change() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    RAISE EXCEPTION 'Published form versions and submissions are immutable' USING ERRCODE = '23514';
                END $$;
                REVOKE ALL ON FUNCTION forms.reject_immutable_change() FROM PUBLIC;
                CREATE TRIGGER immutable_form_version BEFORE UPDATE OR DELETE ON forms.versions
                    FOR EACH ROW EXECUTE FUNCTION forms.reject_immutable_change();
                CREATE TRIGGER immutable_form_submission BEFORE UPDATE OR DELETE ON forms.submissions
                    FOR EACH ROW EXECUTE FUNCTION forms.reject_immutable_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_versions_templates_TemplateId",
                schema: "forms",
                table: "versions");

            migrationBuilder.DropTable(
                name: "operations",
                schema: "forms");

            migrationBuilder.DropTable(
                name: "submissions",
                schema: "forms");

            migrationBuilder.DropTable(
                name: "templates",
                schema: "forms");

            migrationBuilder.DropTable(
                name: "versions",
                schema: "forms");
            migrationBuilder.Sql("DROP FUNCTION forms.reject_immutable_change();");
        }
    }
}
