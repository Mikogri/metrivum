using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProgramEndingAlerts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "ProgramEnding",
                schema: "notifications",
                table: "Preferences",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{LastWeek}'::text[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProgramEnding",
                schema: "notifications",
                table: "Preferences");
        }
    }
}
