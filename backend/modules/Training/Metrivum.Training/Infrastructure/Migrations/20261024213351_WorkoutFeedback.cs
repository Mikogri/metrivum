using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class WorkoutFeedback : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Feedback",
                schema: "training",
                table: "workout_executions",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Feedback",
                schema: "training",
                table: "workout_executions");
        }
    }
}
