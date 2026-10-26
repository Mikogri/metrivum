using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Accounts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DiscoveryReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_profiles_ActiveUsernamePrefix",
                schema: "accounts",
                table: "profiles",
                column: "NormalizedUsername",
                filter: "\"Active\" AND \"Onboarded\" AND \"NormalizedUsername\" IS NOT NULL")
                .Annotation("Npgsql:IndexOperators", new[] { "varchar_pattern_ops" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_profiles_ActiveUsernamePrefix",
                schema: "accounts",
                table: "profiles");
        }
    }
}
