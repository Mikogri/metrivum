using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TransactionHistoryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_simulated_refunds_OwnerId_CreatedAt_Id",
                schema: "billing",
                table: "simulated_refunds",
                columns: new[] { "OwnerId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_payments_ClientId_SettledAt_Id",
                schema: "billing",
                table: "payments",
                columns: new[] { "ClientId", "SettledAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_ClientId_Context_CreatedAt_Id",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "ClientId", "Context", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_CoachId_TeamId_CreatedAt_Id",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "CoachId", "TeamId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_attempts_DueId_CreatedAt_Id",
                schema: "billing",
                table: "payment_attempts",
                columns: new[] { "DueId", "CreatedAt", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_simulated_refunds_OwnerId_CreatedAt_Id",
                schema: "billing",
                table: "simulated_refunds");

            migrationBuilder.DropIndex(
                name: "IX_payments_ClientId_SettledAt_Id",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_ClientId_Context_CreatedAt_Id",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_CoachId_TeamId_CreatedAt_Id",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropIndex(
                name: "IX_payment_attempts_DueId_CreatedAt_Id",
                schema: "billing",
                table: "payment_attempts");
        }
    }
}
