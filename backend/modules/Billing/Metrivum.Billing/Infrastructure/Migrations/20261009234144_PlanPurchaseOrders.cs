using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlanPurchaseOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_context";
                ALTER TABLE billing.payment_dues DROP CONSTRAINT "CK_due_context";
                ALTER TABLE billing.payments DROP CONSTRAINT "CK_payment_context";
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_selected_sessions";
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_context" CHECK ("Context" IN ('CoachingService','Platform','TrainingPlan'));
                ALTER TABLE billing.payment_dues ADD CONSTRAINT "CK_due_context" CHECK ("Context" IN ('CoachingService','Platform','TrainingPlan'));
                ALTER TABLE billing.payments ADD CONSTRAINT "CK_payment_context" CHECK ("Context" IN ('CoachingService','Platform','TrainingPlan'));
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_selected_sessions" CHECK ("Context" = 'Platform' OR ((("OptionSnapshot"->>'Model' = 'CustomPackage' AND "SelectedSessionCount" IS NOT NULL AND "SelectedSessionCount" BETWEEN ("OptionSnapshot"->>'MinSessions')::integer AND ("OptionSnapshot"->>'MaxSessions')::integer) OR ("OptionSnapshot"->>'Model' IN ('PerSession','FixedPackage','PeriodSubscription','OneTime') AND "SelectedSessionCount" IS NULL)) IS TRUE));
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "ServiceId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "RelationshipId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "ServiceId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "RelationshipId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "ApplicationId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TrainingPlanRevisionId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_ApplicationId",
                schema: "billing",
                table: "orders",
                column: "ApplicationId",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_order_purchase_context",
                schema: "billing",
                table: "orders",
                sql: "(\"Context\" = 'TrainingPlan' AND \"ServiceId\" IS NULL AND \"RelationshipId\" IS NULL AND \"ApplicationId\" IS NOT NULL AND \"TrainingPlanRevisionId\" IS NOT NULL) OR (\"Context\" <> 'TrainingPlan' AND (\"Context\" = 'Platform' OR (\"ServiceId\" IS NOT NULL AND \"RelationshipId\" IS NOT NULL)) AND \"ApplicationId\" IS NULL AND \"TrainingPlanRevisionId\" IS NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN IF EXISTS(SELECT 1 FROM billing.orders WHERE "Context"='TrainingPlan') THEN RAISE EXCEPTION 'Cannot roll back delivered plan purchases'; END IF; END $$;
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_context";
                ALTER TABLE billing.payment_dues DROP CONSTRAINT "CK_due_context";
                ALTER TABLE billing.payments DROP CONSTRAINT "CK_payment_context";
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_selected_sessions";
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_context" CHECK ("Context" IN ('CoachingService','Platform'));
                ALTER TABLE billing.payment_dues ADD CONSTRAINT "CK_due_context" CHECK ("Context" IN ('CoachingService','Platform'));
                ALTER TABLE billing.payments ADD CONSTRAINT "CK_payment_context" CHECK ("Context" IN ('CoachingService','Platform'));
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_selected_sessions" CHECK ("Context" = 'Platform' OR ((("OptionSnapshot"->>'Model' = 'CustomPackage' AND "SelectedSessionCount" IS NOT NULL AND "SelectedSessionCount" BETWEEN ("OptionSnapshot"->>'MinSessions')::integer AND ("OptionSnapshot"->>'MaxSessions')::integer) OR ("OptionSnapshot"->>'Model' IN ('PerSession','FixedPackage','PeriodSubscription') AND "SelectedSessionCount" IS NULL)) IS TRUE));
                """);

            migrationBuilder.DropIndex(
                name: "IX_orders_ApplicationId",
                schema: "billing",
                table: "orders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_order_purchase_context",
                schema: "billing",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "ApplicationId",
                schema: "billing",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "TrainingPlanRevisionId",
                schema: "billing",
                table: "orders");

            migrationBuilder.AlterColumn<Guid>(
                name: "ServiceId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "RelationshipId",
                schema: "billing",
                table: "payment_dues",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ServiceId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "RelationshipId",
                schema: "billing",
                table: "orders",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
