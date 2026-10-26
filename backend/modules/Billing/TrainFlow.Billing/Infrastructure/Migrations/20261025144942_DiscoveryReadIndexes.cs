using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DiscoveryReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_team_requests_InviterId_CreatedAt",
                schema: "billing",
                table: "team_requests",
                columns: new[] { "InviterId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_team_requests_TeamId_Kind_CreatedAt_Id",
                schema: "billing",
                table: "team_requests",
                columns: new[] { "TeamId", "Kind", "CreatedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_team_requests_InviterId_CreatedAt",
                schema: "billing",
                table: "team_requests");

            migrationBuilder.DropIndex(
                name: "IX_team_requests_TeamId_Kind_CreatedAt_Id",
                schema: "billing",
                table: "team_requests");
        }
    }
}
