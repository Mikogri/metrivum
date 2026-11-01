using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountIdentityConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles",
                sql: "\"Role\" IN ('Coach', 'Client', 'CatalogAdmin', 'AccessAdmin')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_display_name",
                schema: "accounts",
                table: "profiles",
                sql: "char_length(\"DisplayName\") <= 100 AND \"DisplayName\" = btrim(\"DisplayName\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_username_normalized",
                schema: "accounts",
                table: "profiles",
                sql: "(\"Username\" IS NULL AND \"NormalizedUsername\" IS NULL) OR \"NormalizedUsername\" = upper(\"Username\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_profiles_username_shape",
                schema: "accounts",
                table: "profiles",
                sql: "\"Username\" IS NULL OR \"Username\" ~ '^[A-Za-z0-9_]{3,32}$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_display_name",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_username_normalized",
                schema: "accounts",
                table: "profiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_profiles_username_shape",
                schema: "accounts",
                table: "profiles");
        }
    }
}
