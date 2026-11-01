using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class OccurrenceRepetition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_workout_occurrences_AssignmentId_RevisionId_WorkoutId",
                schema: "training",
                table: "workout_occurrences");

            migrationBuilder.AddColumn<int>(
                name: "Repetition",
                schema: "training",
                table: "workout_occurrences",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_workout_occurrences_AssignmentId_RevisionId_WorkoutId_Repet~",
                schema: "training",
                table: "workout_occurrences",
                columns: new[] { "AssignmentId", "RevisionId", "WorkoutId", "Repetition" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_workout_occurrences_AssignmentId_RevisionId_WorkoutId_Repet~",
                schema: "training",
                table: "workout_occurrences");

            migrationBuilder.DropColumn(
                name: "Repetition",
                schema: "training",
                table: "workout_occurrences");

            migrationBuilder.CreateIndex(
                name: "IX_workout_occurrences_AssignmentId_RevisionId_WorkoutId",
                schema: "training",
                table: "workout_occurrences",
                columns: new[] { "AssignmentId", "RevisionId", "WorkoutId" },
                unique: true);
        }
    }
}
