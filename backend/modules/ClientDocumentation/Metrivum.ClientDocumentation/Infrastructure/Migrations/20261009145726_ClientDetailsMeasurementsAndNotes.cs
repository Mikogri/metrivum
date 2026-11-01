using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.ClientDocumentation.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientDetailsMeasurementsAndNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "Version",
                schema: "client_documentation",
                table: "measurements",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<long>(
                name: "Size",
                schema: "client_documentation",
                table: "documents",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Title",
                schema: "client_documentation",
                table: "coach_notes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Version",
                schema: "client_documentation",
                table: "measurements");

            migrationBuilder.DropColumn(
                name: "Size",
                schema: "client_documentation",
                table: "documents");

            migrationBuilder.DropColumn(
                name: "Title",
                schema: "client_documentation",
                table: "coach_notes");
        }
    }
}
