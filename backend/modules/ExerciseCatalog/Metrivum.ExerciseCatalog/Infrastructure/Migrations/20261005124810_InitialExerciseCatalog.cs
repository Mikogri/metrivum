using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Metrivum.ExerciseCatalog.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialExerciseCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "exercise_catalog");

            migrationBuilder.CreateTable(
                name: "exercises",
                schema: "exercise_catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    author_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    normalized_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    instructions = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                    demonstration_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    version = table.Column<int>(type: "integer", nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercises", x => x.id);
                    table.CheckConstraint("ck_exercise_version", "version > 0");
                });

            migrationBuilder.CreateTable(
                name: "movement_patterns",
                schema: "exercise_catalog",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    label_en = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    label_pl = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_movement_patterns", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "muscles",
                schema: "exercise_catalog",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    label_en = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    label_pl = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_muscles", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                schema: "exercise_catalog",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    normalized_name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    merged_into_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tags", x => x.id);
                    table.ForeignKey(
                        name: "FK_tags_tags_merged_into_id",
                        column: x => x.merged_into_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "exercise_revisions",
                schema: "exercise_catalog",
                columns: table => new
                {
                    exercise_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    instructions = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                    is_archived = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    changed_by = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercise_revisions", x => new { x.exercise_id, x.version });
                    table.ForeignKey(
                        name: "FK_exercise_revisions_exercises_exercise_id",
                        column: x => x.exercise_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "exercises",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "favorites",
                schema: "exercise_catalog",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exercise_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_favorites", x => new { x.user_id, x.exercise_id });
                    table.ForeignKey(
                        name: "FK_favorites_exercises_exercise_id",
                        column: x => x.exercise_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "exercises",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "exercise_movement_patterns",
                schema: "exercise_catalog",
                columns: table => new
                {
                    exercise_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pattern_key = table.Column<string>(type: "character varying(80)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercise_movement_patterns", x => new { x.exercise_id, x.pattern_key });
                    table.ForeignKey(
                        name: "FK_exercise_movement_patterns_exercises_exercise_id",
                        column: x => x.exercise_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "exercises",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exercise_movement_patterns_movement_patterns_pattern_key",
                        column: x => x.pattern_key,
                        principalSchema: "exercise_catalog",
                        principalTable: "movement_patterns",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "exercise_muscles",
                schema: "exercise_catalog",
                columns: table => new
                {
                    exercise_id = table.Column<Guid>(type: "uuid", nullable: false),
                    muscle_key = table.Column<string>(type: "character varying(80)", nullable: false),
                    is_primary = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercise_muscles", x => new { x.exercise_id, x.muscle_key });
                    table.ForeignKey(
                        name: "FK_exercise_muscles_exercises_exercise_id",
                        column: x => x.exercise_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "exercises",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exercise_muscles_muscles_muscle_key",
                        column: x => x.muscle_key,
                        principalSchema: "exercise_catalog",
                        principalTable: "muscles",
                        principalColumn: "key",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "exercise_tags",
                schema: "exercise_catalog",
                columns: table => new
                {
                    exercise_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tag_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exercise_tags", x => new { x.exercise_id, x.tag_id });
                    table.ForeignKey(
                        name: "FK_exercise_tags_exercises_exercise_id",
                        column: x => x.exercise_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "exercises",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_exercise_tags_tags_tag_id",
                        column: x => x.tag_id,
                        principalSchema: "exercise_catalog",
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "exercise_catalog",
                table: "movement_patterns",
                columns: new[] { "key", "is_active", "label_en", "label_pl", "version" },
                values: new object[,]
                {
                    { "carry", true, "Carry", "Noszenie", 1 },
                    { "hinge", true, "Hip hinge", "Zgięcie w biodrach", 1 },
                    { "horizontal-pull", true, "Horizontal pull", "Przyciąganie poziome", 1 },
                    { "horizontal-push", true, "Horizontal push", "Wypychanie poziome", 1 },
                    { "lunge", true, "Lunge", "Wykrok", 1 },
                    { "rotation", true, "Rotation", "Rotacja", 1 },
                    { "squat", true, "Squat", "Przysiad", 1 },
                    { "vertical-pull", true, "Vertical pull", "Przyciąganie pionowe", 1 },
                    { "vertical-push", true, "Vertical push", "Wypychanie pionowe", 1 }
                });

            migrationBuilder.InsertData(
                schema: "exercise_catalog",
                table: "muscles",
                columns: new[] { "key", "is_active", "label_en", "label_pl", "version" },
                values: new object[,]
                {
                    { "back", true, "Back", "Mięśnie grzbietu", 1 },
                    { "biceps", true, "Biceps", "Mięśnie dwugłowe ramienia", 1 },
                    { "calves", true, "Calves", "Mięśnie łydek", 1 },
                    { "chest", true, "Chest", "Mięśnie klatki piersiowej", 1 },
                    { "core", true, "Core", "Mięśnie tułowia", 1 },
                    { "glutes", true, "Glutes", "Mięśnie pośladkowe", 1 },
                    { "hamstrings", true, "Hamstrings", "Mięśnie kulszowo-goleniowe", 1 },
                    { "quadriceps", true, "Quadriceps", "Mięśnie czworogłowe uda", 1 },
                    { "shoulders", true, "Shoulders", "Mięśnie naramienne", 1 },
                    { "triceps", true, "Triceps", "Mięśnie trójgłowe ramienia", 1 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_exercise_movement_patterns_pattern_key_exercise_id",
                schema: "exercise_catalog",
                table: "exercise_movement_patterns",
                columns: new[] { "pattern_key", "exercise_id" });

            migrationBuilder.CreateIndex(
                name: "IX_exercise_muscles_muscle_key_exercise_id",
                schema: "exercise_catalog",
                table: "exercise_muscles",
                columns: new[] { "muscle_key", "exercise_id" });

            migrationBuilder.CreateIndex(
                name: "IX_exercise_tags_tag_id_exercise_id",
                schema: "exercise_catalog",
                table: "exercise_tags",
                columns: new[] { "tag_id", "exercise_id" });

            migrationBuilder.CreateIndex(
                name: "IX_exercises_author_id",
                schema: "exercise_catalog",
                table: "exercises",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "IX_exercises_is_archived_created_at_id",
                schema: "exercise_catalog",
                table: "exercises",
                columns: new[] { "is_archived", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_exercises_is_archived_normalized_name_id",
                schema: "exercise_catalog",
                table: "exercises",
                columns: new[] { "is_archived", "normalized_name", "id" });

            migrationBuilder.CreateIndex(
                name: "ux_exercise_normalized_name",
                schema: "exercise_catalog",
                table: "exercises",
                column: "normalized_name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_favorites_exercise_id",
                schema: "exercise_catalog",
                table: "favorites",
                column: "exercise_id");

            migrationBuilder.CreateIndex(
                name: "IX_tags_merged_into_id",
                schema: "exercise_catalog",
                table: "tags",
                column: "merged_into_id");

            migrationBuilder.CreateIndex(
                name: "ux_exercise_tag_normalized_name",
                schema: "exercise_catalog",
                table: "tags",
                column: "normalized_name",
                unique: true);

            // v1 uses a private schema, restricted database roles and API authorization.
            // These tables are created above; this does not alter pre-existing policies.
            migrationBuilder.Sql("""
                ALTER TABLE exercise_catalog.exercises DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.exercise_revisions DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.tags DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.exercise_tags DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.muscles DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.exercise_muscles DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.movement_patterns DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.exercise_movement_patterns DISABLE ROW LEVEL SECURITY;
                ALTER TABLE exercise_catalog.favorites DISABLE ROW LEVEL SECURITY;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "exercise_movement_patterns",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "exercise_muscles",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "exercise_revisions",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "exercise_tags",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "favorites",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "movement_patterns",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "muscles",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "tags",
                schema: "exercise_catalog");

            migrationBuilder.DropTable(
                name: "exercises",
                schema: "exercise_catalog");
        }
    }
}
