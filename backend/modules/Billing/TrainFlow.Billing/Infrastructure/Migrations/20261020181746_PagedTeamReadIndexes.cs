using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PagedTeamReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_team_memberships_TeamId_JoinedAt_UserId",
                schema: "billing",
                table: "team_memberships",
                columns: new[] { "TeamId", "JoinedAt", "UserId" },
                filter: "\"Status\" = 'Active'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_team_memberships_TeamId_JoinedAt_UserId",
                schema: "billing",
                table: "team_memberships");
        }
    }
}
