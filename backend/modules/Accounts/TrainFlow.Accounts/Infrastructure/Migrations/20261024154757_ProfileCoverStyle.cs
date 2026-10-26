using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProfileCoverStyle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoverStyle",
                schema: "accounts",
                table: "profiles",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoverStyle",
                schema: "accounts",
                table: "profiles");
        }
    }
}
