using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SimulatedRefundLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "simulated_refunds",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_simulated_refunds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_simulated_refunds_payments_PaymentId",
                        column: x => x.PaymentId,
                        principalSchema: "billing",
                        principalTable: "payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_simulated_refunds_OwnerId_CreatedAt",
                schema: "billing",
                table: "simulated_refunds",
                columns: new[] { "OwnerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_simulated_refunds_PaymentId",
                schema: "billing",
                table: "simulated_refunds",
                column: "PaymentId",
                unique: true);
            migrationBuilder.Sql("CREATE TRIGGER protect_simulated_refunds BEFORE UPDATE OR DELETE ON billing.simulated_refunds FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "simulated_refunds",
                schema: "billing");
        }
    }
}
