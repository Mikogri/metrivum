using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Metrivum.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlatformSubscriptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AutoRenew",
                schema: "billing",
                table: "subscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "PaymentMethodId",
                schema: "billing",
                table: "subscriptions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Context",
                schema: "billing",
                table: "payments",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CoachingService");

            migrationBuilder.AddColumn<string>(
                name: "Context",
                schema: "billing",
                table: "payment_dues",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CoachingService");

            migrationBuilder.AddColumn<string>(
                name: "Context",
                schema: "billing",
                table: "orders",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CoachingService");

            migrationBuilder.CreateTable(
                name: "platform_plans",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CommissionRate = table.Column<decimal>(type: "numeric(7,6)", precision: 7, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_plans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "plan_prices",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Version = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(28,2)", precision: 28, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    TermsVersion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_prices", x => x.Id);
                    table.CheckConstraint("CK_plan_price", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_plan_prices_platform_plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "billing",
                        principalTable: "platform_plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "platform_subscriptions",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    AcceptedPriceId = table.Column<Guid>(type: "uuid", nullable: true),
                    PeriodStart = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PeriodEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextDueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    AutoRenew = table.Column<bool>(type: "boolean", nullable: false),
                    PaymentMethodId = table.Column<Guid>(type: "uuid", nullable: true),
                    PendingPlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    PendingDueId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_platform_subscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_platform_subscriptions_payment_dues_PendingDueId",
                        column: x => x.PendingDueId,
                        principalSchema: "billing",
                        principalTable: "payment_dues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_platform_subscriptions_payment_methods_PaymentMethodId",
                        column: x => x.PaymentMethodId,
                        principalSchema: "billing",
                        principalTable: "payment_methods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_platform_subscriptions_plan_prices_AcceptedPriceId",
                        column: x => x.AcceptedPriceId,
                        principalSchema: "billing",
                        principalTable: "plan_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_platform_subscriptions_platform_plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "billing",
                        principalTable: "platform_plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "plan_changes",
                schema: "billing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    PlanId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    DueId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EffectiveAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_plan_changes_payment_dues_DueId",
                        column: x => x.DueId,
                        principalSchema: "billing",
                        principalTable: "payment_dues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_plan_changes_platform_subscriptions_SubscriptionId",
                        column: x => x.SubscriptionId,
                        principalSchema: "billing",
                        principalTable: "platform_subscriptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "billing",
                table: "platform_plans",
                columns: new[] { "Id", "CommissionRate", "Name" },
                values: new object[,]
                {
                    { "Free", 0.10m, "Free" },
                    { "Pro", 0.05m, "Pro" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_PaymentMethodId",
                schema: "billing",
                table: "subscriptions",
                column: "PaymentMethodId");

            migrationBuilder.CreateIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues",
                columns: new[] { "ClientId", "PeriodStart" },
                unique: true,
                filter: "\"Context\" = 'Platform'");

            migrationBuilder.CreateIndex(
                name: "IX_plan_changes_DueId",
                schema: "billing",
                table: "plan_changes",
                column: "DueId");

            migrationBuilder.CreateIndex(
                name: "IX_plan_changes_SubscriptionId_CreatedAt",
                schema: "billing",
                table: "plan_changes",
                columns: new[] { "SubscriptionId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_prices_PlanId_Version",
                schema: "billing",
                table: "plan_prices",
                columns: new[] { "PlanId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_AcceptedPriceId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "AcceptedPriceId");

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_OwnerId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "OwnerId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_PaymentMethodId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "PaymentMethodId");

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_PendingDueId",
                schema: "billing",
                table: "platform_subscriptions",
                column: "PendingDueId");

            migrationBuilder.CreateIndex(
                name: "IX_platform_subscriptions_PlanId_PeriodEnd",
                schema: "billing",
                table: "platform_subscriptions",
                columns: new[] { "PlanId", "PeriodEnd" });

            migrationBuilder.AddForeignKey(
                name: "FK_subscriptions_payment_methods_PaymentMethodId",
                schema: "billing",
                table: "subscriptions",
                column: "PaymentMethodId",
                principalSchema: "billing",
                principalTable: "payment_methods",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_subscriptions_payment_methods_PaymentMethodId",
                schema: "billing",
                table: "subscriptions");

            migrationBuilder.DropTable(
                name: "plan_changes",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "platform_subscriptions",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "plan_prices",
                schema: "billing");

            migrationBuilder.DropTable(
                name: "platform_plans",
                schema: "billing");

            migrationBuilder.DropIndex(
                name: "IX_subscriptions_PaymentMethodId",
                schema: "billing",
                table: "subscriptions");

            migrationBuilder.DropIndex(
                name: "IX_payment_dues_ClientId_PeriodStart",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "AutoRenew",
                schema: "billing",
                table: "subscriptions");

            migrationBuilder.DropColumn(
                name: "PaymentMethodId",
                schema: "billing",
                table: "subscriptions");

            migrationBuilder.DropColumn(
                name: "Context",
                schema: "billing",
                table: "payments");

            migrationBuilder.DropColumn(
                name: "Context",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "Context",
                schema: "billing",
                table: "orders");
        }
    }
}
