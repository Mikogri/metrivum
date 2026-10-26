using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ServiceCancellationHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "service_renewal_changes",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_service_renewal_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_service_renewal_changes_subscriptions_SubscriptionId",
                        column: x => x.SubscriptionId,
                        principalSchema: "billing",
                        principalTable: "subscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_service_renewal_changes_SubscriptionId_CreatedAt_Id",
                schema: "billing",
                table: "service_renewal_changes",
                columns: new[] { "SubscriptionId", "CreatedAt", "Id" });
            migrationBuilder.Sql("CREATE TRIGGER protect_service_renewal_changes BEFORE UPDATE OR DELETE ON billing.service_renewal_changes FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "service_renewal_changes",
                schema: "billing");
        }
    }
}
