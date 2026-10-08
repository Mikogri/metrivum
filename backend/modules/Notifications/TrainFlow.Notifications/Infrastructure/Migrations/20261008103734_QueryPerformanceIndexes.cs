using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class QueryPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Notifications_PendingDelivery",
                schema: "notifications",
                table: "Notifications",
                column: "AvailableAt",
                filter: "\"DeliveredAt\" IS NULL AND NOT \"Cancelled\"");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_Unread",
                schema: "notifications",
                table: "Notifications",
                columns: new[] { "RecipientUserId", "AvailableAt" },
                filter: "\"ReadAt\" IS NULL AND NOT \"Cancelled\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notifications_PendingDelivery",
                schema: "notifications",
                table: "Notifications");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_Unread",
                schema: "notifications",
                table: "Notifications");
        }
    }
}
