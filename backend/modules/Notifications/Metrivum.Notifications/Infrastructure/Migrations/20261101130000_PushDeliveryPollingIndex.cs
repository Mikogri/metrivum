using Microsoft.EntityFrameworkCore.Migrations;

namespace Metrivum.Notifications.Infrastructure.Migrations;

public partial class PushDeliveryPollingIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.CreateIndex(
        name: "IX_PushDeliveries_Ready", schema: "notifications", table: "PushDeliveries", column: "AvailableAt",
        filter: "\"Status\" IN ('Pending', 'Receipt')");

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropIndex(
        name: "IX_PushDeliveries_Ready", schema: "notifications", table: "PushDeliveries");
}
