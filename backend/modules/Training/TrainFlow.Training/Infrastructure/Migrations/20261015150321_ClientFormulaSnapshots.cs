using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientFormulaSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FormulaSnapshot",
                schema: "training",
                table: "assignments",
                type: "jsonb",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "client_exercise_maxes",
                schema: "training",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reps = table.Column<int>(type: "integer", nullable: false),
                    LoadKg = table.Column<decimal>(type: "numeric", nullable: false),
                    RecordedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Alias = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_exercise_maxes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_client_exercise_maxes_ClientId_Alias",
                schema: "training",
                table: "client_exercise_maxes",
                columns: new[] { "ClientId", "Alias" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "client_exercise_maxes",
                schema: "training");

            migrationBuilder.DropColumn(
                name: "FormulaSnapshot",
                schema: "training",
                table: "assignments");
        }
    }
}
