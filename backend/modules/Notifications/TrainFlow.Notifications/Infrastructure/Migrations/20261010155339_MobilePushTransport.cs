using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Notifications.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MobilePushTransport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PushDevices",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    InstallationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Token = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Platform = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    ActiveConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ActiveUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushDevices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PushDeliveries",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Token = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TicketId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PushDeliveries_Notifications_NotificationId",
                        column: x => x.NotificationId,
                        principalSchema: "notifications",
                        principalTable: "Notifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PushDeliveries_PushDevices_DeviceId",
                        column: x => x.DeviceId,
                        principalSchema: "notifications",
                        principalTable: "PushDevices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PushDeliveries_DeviceId",
                schema: "notifications",
                table: "PushDeliveries",
                column: "DeviceId");

            migrationBuilder.CreateIndex(
                name: "IX_PushDeliveries_NotificationId_DeviceId",
                schema: "notifications",
                table: "PushDeliveries",
                columns: new[] { "NotificationId", "DeviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PushDeliveries_Status_AvailableAt",
                schema: "notifications",
                table: "PushDeliveries",
                columns: new[] { "Status", "AvailableAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PushDevices_UserId_InstallationId",
                schema: "notifications",
                table: "PushDevices",
                columns: new[] { "UserId", "InstallationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PushDeliveries",
                schema: "notifications");

            migrationBuilder.DropTable(
                name: "PushDevices",
                schema: "notifications");
        }
    }
}
