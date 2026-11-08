using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ExerciseEditorRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles");

            migrationBuilder.AddCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles",
                sql: "\"Role\" IN ('Coach', 'Client', 'CatalogAdmin', 'AccessAdmin', 'ExerciseEditor')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles");

            migrationBuilder.AddCheckConstraint(
                name: "CK_user_roles_role",
                schema: "accounts",
                table: "user_roles",
                sql: "\"Role\" IN ('Coach', 'Client', 'CatalogAdmin', 'AccessAdmin')");
        }
    }
}
