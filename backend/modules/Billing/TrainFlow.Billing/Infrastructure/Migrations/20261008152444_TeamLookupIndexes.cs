using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamLookupIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_team_requests_UserId",
                schema: "billing",
                table: "team_requests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_team_requests_UserId",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropIndex(
                name: "IX_team_memberships_UserId",
                schema: "billing",
                table: "team_memberships");
        }
    }
}
