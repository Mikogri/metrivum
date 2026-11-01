using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PagedTeamReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TeamClientCases_TeamId_CreatedAt_Id",
                schema: "coaching",
                table: "TeamClientCases",
                columns: new[] { "TeamId", "CreatedAt", "Id" },
                descending: new[] { false, true, false });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_ClientId_CreatedAt_Id",
                schema: "coaching",
                table: "ClientTransferRequests",
                columns: new[] { "ClientId", "CreatedAt", "Id" },
                descending: new[] { false, true, false });

            migrationBuilder.CreateIndex(
                name: "IX_ClientTransferRequests_TeamId_CreatedAt_Id",
                schema: "coaching",
                table: "ClientTransferRequests",
                columns: new[] { "TeamId", "CreatedAt", "Id" },
                descending: new[] { false, true, false });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TeamClientCases_TeamId_CreatedAt_Id",
                schema: "coaching",
                table: "TeamClientCases");

            migrationBuilder.DropIndex(
                name: "IX_ClientTransferRequests_ClientId_CreatedAt_Id",
                schema: "coaching",
                table: "ClientTransferRequests");

            migrationBuilder.DropIndex(
                name: "IX_ClientTransferRequests_TeamId_CreatedAt_Id",
                schema: "coaching",
                table: "ClientTransferRequests");
        }
    }
}
