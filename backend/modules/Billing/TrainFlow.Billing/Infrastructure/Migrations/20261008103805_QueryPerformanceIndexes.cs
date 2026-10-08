using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class QueryPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_payments_CoachId_SettledAt",
                schema: "billing",
                table: "payments",
                columns: new[] { "CoachId", "SettledAt" },
                filter: "\"Context\" = 'CoachingService'");

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_CoachId_DueAt",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "CoachId", "DueAt" },
                filter: "\"Context\" = 'CoachingService' AND \"Status\" = 'AwaitingPayment'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_payments_CoachId_SettledAt",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_CoachId_DueAt",
                schema: "billing",
                table: "payment_dues");
        }
    }
}
