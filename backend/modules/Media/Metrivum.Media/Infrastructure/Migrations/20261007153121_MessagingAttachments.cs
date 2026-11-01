using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Media.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MessagingAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "DurationMs",
                schema: "media",
                table: "files",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                schema: "media",
                table: "files",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Video");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DurationMs",
                schema: "media",
                table: "files");

            migrationBuilder.DropColumn(
                name: "Purpose",
                schema: "media",
                table: "files");
        }
    }
}
