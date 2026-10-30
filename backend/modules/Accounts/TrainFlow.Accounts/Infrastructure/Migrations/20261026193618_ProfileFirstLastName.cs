using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProfileFirstLastName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FirstName",
                schema: "accounts",
                table: "profiles",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastName",
                schema: "accounts",
                table: "profiles",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            // Existing accounts: the display name split at its first space (a part longer than 50 characters stays empty).
            migrationBuilder.Sql("""
                UPDATE accounts.profiles AS profile SET
                    "FirstName" = CASE WHEN parts.first <> '' AND char_length(parts.first) <= 50 THEN parts.first END,
                    "LastName" = CASE WHEN parts.rest <> '' AND char_length(parts.rest) <= 50 THEN parts.rest END
                FROM (
                    SELECT "Id", split_part("DisplayName", ' ', 1) AS first,
                        CASE WHEN position(' ' IN "DisplayName") > 0 THEN substr("DisplayName", position(' ' IN "DisplayName") + 1) ELSE '' END AS rest
                    FROM accounts.profiles
                ) AS parts
                WHERE profile."Id" = parts."Id" AND profile."DisplayName" <> '';
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_first_name",
                schema: "accounts",
                table: "profiles",
                sql: "\"FirstName\" IS NULL OR (char_length(\"FirstName\") BETWEEN 1 AND 50 AND \"FirstName\" = btrim(\"FirstName\"))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_last_name",
                schema: "accounts",
                table: "profiles",
                sql: "\"LastName\" IS NULL OR (char_length(\"LastName\") BETWEEN 1 AND 50 AND \"LastName\" = btrim(\"LastName\"))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_first_name",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_last_name",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "FirstName",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropColumn(
                name: "LastName",
                schema: "accounts",
                table: "profiles");
        }
    }
}
