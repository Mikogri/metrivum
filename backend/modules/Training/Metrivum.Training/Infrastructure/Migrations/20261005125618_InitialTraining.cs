using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialTraining : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "training");

            migrationBuilder.CreateTable(
                name: "folders",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_folders", x => x.Id);
                    table.UniqueConstraint("AK_folders_Id_WorkspaceId", x => new { x.Id, x.WorkspaceId });
                    table.CheckConstraint("ck_folder_not_self", "\"ParentId\" IS NULL OR \"ParentId\" <> \"Id\"");
                    table.CheckConstraint("ck_folder_position", "\"Position\" >= 0");
                    table.ForeignKey(
                        name: "FK_folders_folders_ParentId_WorkspaceId",
                        columns: x => new { x.ParentId, x.WorkspaceId },
                        principalSchema: "training",
                        principalTable: "folders",
                        principalColumns: new[] { "Id", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "formulas",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_formulas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "imports",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Rows = table.Column<string>(type: "jsonb", nullable: false),
                    Mapping = table.Column<string>(type: "jsonb", nullable: false),
                    CommittedPlanId = table.Column<Guid>(type: "uuid", nullable: true),
                    CommitKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_imports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "plans",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    FolderId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Archived = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Draft = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_plans_folders_FolderId_WorkspaceId",
                        columns: x => new { x.FolderId, x.WorkspaceId },
                        principalSchema: "training",
                        principalTable: "folders",
                        principalColumns: new[] { "Id", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "formula_versions",
                schema: "training",
                columns: table => new
                {
                    FormulaId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Definition = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_formula_versions", x => new { x.FormulaId, x.Version });
                    table.ForeignKey(
                        name: "FK_formula_versions_formulas_FormulaId",
                        column: x => x.FormulaId,
                        principalSchema: "training",
                        principalTable: "formulas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "revisions",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    DraftVersion = table.Column<long>(type: "bigint", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_revisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_revisions_plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "training",
                        principalTable: "plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_folders_ParentId_WorkspaceId",
                schema: "training",
                table: "folders",
                columns: new[] { "ParentId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_folders_WorkspaceId_ParentId_Position_Id",
                schema: "training",
                table: "folders",
                columns: new[] { "WorkspaceId", "ParentId", "Position", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_formulas_WorkspaceId_OwnerId_Name_Id",
                schema: "training",
                table: "formulas",
                columns: new[] { "WorkspaceId", "OwnerId", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_imports_OwnerId_CommitKey",
                schema: "training",
                table: "imports",
                columns: new[] { "OwnerId", "CommitKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_imports_WorkspaceId_ExpiresAt",
                schema: "training",
                table: "imports",
                columns: new[] { "WorkspaceId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_plans_FolderId_WorkspaceId",
                schema: "training",
                table: "plans",
                columns: new[] { "FolderId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_plans_WorkspaceId_OwnerId_Archived_UpdatedAt_Id",
                schema: "training",
                table: "plans",
                columns: new[] { "WorkspaceId", "OwnerId", "Archived", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_revisions_PlanId_IdempotencyKey",
                schema: "training",
                table: "revisions",
                columns: new[] { "PlanId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_revisions_PlanId_Number",
                schema: "training",
                table: "revisions",
                columns: new[] { "PlanId", "Number" },
                unique: true);

            migrationBuilder.Sql("""
                ALTER TABLE training.folders DISABLE ROW LEVEL SECURITY;
                ALTER TABLE training.formulas DISABLE ROW LEVEL SECURITY;
                ALTER TABLE training.formula_versions DISABLE ROW LEVEL SECURITY;
                ALTER TABLE training.imports DISABLE ROW LEVEL SECURITY;
                ALTER TABLE training.plans DISABLE ROW LEVEL SECURITY;
                ALTER TABLE training.revisions DISABLE ROW LEVEL SECURITY;
                CREATE FUNCTION training.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                  RAISE EXCEPTION 'Published training revisions and formula versions are immutable' USING ERRCODE = '23000';
                END;
                $$;
                CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON training.revisions
                  FOR EACH ROW EXECUTE FUNCTION training.reject_immutable_change();
                CREATE TRIGGER formula_versions_immutable BEFORE UPDATE OR DELETE ON training.formula_versions
                  FOR EACH ROW EXECUTE FUNCTION training.reject_immutable_change();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "formula_versions",
                schema: "training");

            migrationBuilder.DropTable(
                name: "imports",
                schema: "training");

            migrationBuilder.DropTable(
                name: "revisions",
                schema: "training");

            migrationBuilder.DropTable(
                name: "formulas",
                schema: "training");

            migrationBuilder.DropTable(
                name: "plans",
                schema: "training");

            migrationBuilder.DropTable(
                name: "folders",
                schema: "training");

            migrationBuilder.Sql("DROP FUNCTION training.reject_immutable_change();");
        }
    }
}
