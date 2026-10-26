using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CanonicalSimulatedPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PendingPlanId",
                schema: "billing",
                table: "team_platform_subscriptions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.UpdateData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Pro",
                column: "CommissionRate",
                value: 0.10m);

            migrationBuilder.UpdateData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Team",
                column: "CommissionRate",
                value: 0.10m);

            migrationBuilder.InsertData(
                schema: "billing",
                table: "platform_plans",
                columns: new[] { "Id", "CommissionRate", "Name" },
                values: new object[,]
                {
                    { "Starter", 0.10m, "Starter" },
                    { "Studio", 0.10m, "Studio" }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Starter");

            migrationBuilder.DeleteData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Studio");

            migrationBuilder.DropColumn(
                name: "PendingPlanId",
                schema: "billing",
                table: "team_platform_subscriptions");

            migrationBuilder.UpdateData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Pro",
                column: "CommissionRate",
                value: 0.05m);

            migrationBuilder.UpdateData(
                schema: "billing",
                table: "platform_plans",
                keyColumn: "Id",
                keyValue: "Team",
                column: "CommissionRate",
                value: 0.05m);
        }
    }
}
