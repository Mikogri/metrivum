using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PendingCheckoutPrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "PendingPriceId");

            migrationBuilder.AddForeignKey(
                name: "FK_platform_subscriptions_plan_prices_PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "PendingPriceId",
                principalSchema: "billing",
                principalTable: "plan_prices",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_platform_subscriptions_plan_prices_PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions");

            migrationBuilder.DropIndex(
                name: "IX_platform_subscriptions_PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions");

            migrationBuilder.DropColumn(
                name: "PendingPriceId",
                schema: "billing",
                table: "platform_subscriptions");
        }
    }
}
