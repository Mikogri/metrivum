using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProfileSystemFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Currency",
                schema: "accounts",
                table: "profiles",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "EUR");

            migrationBuilder.AddColumn<string>(
                name: "SystemValues",
                schema: "accounts",
                table: "profiles",
                type: "jsonb",
                nullable: false,
                defaultValueSql: "'{}'::jsonb");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Currency",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "SystemValues",
                schema: "accounts",
                table: "profiles");
        }
    }
}
