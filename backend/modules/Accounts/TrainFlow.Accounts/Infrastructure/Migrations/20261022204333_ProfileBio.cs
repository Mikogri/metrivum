using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProfileBio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Bio",
                schema: "accounts",
                table: "profiles",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_bio",
                schema: "accounts",
                table: "profiles",
                sql: "\"Bio\" IS NULL OR (char_length(\"Bio\") BETWEEN 1 AND 500 AND \"Bio\" = btrim(\"Bio\"))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_bio",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "Bio",
                schema: "accounts",
                table: "profiles");
        }
    }
}
