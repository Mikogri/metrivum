using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlatformBillingGuards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_selected_sessions";
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_selected_sessions" CHECK ("Context" = 'Platform' OR ((("OptionSnapshot"->>'Model' = 'CustomPackage' AND "SelectedSessionCount" IS NOT NULL AND "SelectedSessionCount" BETWEEN ("OptionSnapshot"->>'MinSessions')::integer AND ("OptionSnapshot"->>'MaxSessions')::integer) OR ("OptionSnapshot"->>'Model' IN ('PerSession','FixedPackage','PeriodSubscription') AND "SelectedSessionCount" IS NULL)) IS TRUE));
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_context" CHECK ("Context" IN ('CoachingService','Platform'));
                ALTER TABLE billing.payment_dues ADD CONSTRAINT "CK_due_context" CHECK ("Context" IN ('CoachingService','Platform'));
                ALTER TABLE billing.payments ADD CONSTRAINT "CK_payment_context" CHECK ("Context" IN ('CoachingService','Platform'));
                CREATE TRIGGER protect_plan_price BEFORE UPDATE OR DELETE ON billing.plan_prices FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                CREATE TRIGGER protect_plan_change BEFORE UPDATE OR DELETE ON billing.plan_changes FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change();
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER protect_plan_price ON billing.plan_prices;
                DROP TRIGGER protect_plan_change ON billing.plan_changes;
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_context";
                ALTER TABLE billing.payment_dues DROP CONSTRAINT "CK_due_context";
                ALTER TABLE billing.payments DROP CONSTRAINT "CK_payment_context";
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_selected_sessions";
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_selected_sessions" CHECK ((("OptionSnapshot"->>'Model' = 'CustomPackage' AND "SelectedSessionCount" IS NOT NULL AND "SelectedSessionCount" BETWEEN ("OptionSnapshot"->>'MinSessions')::integer AND ("OptionSnapshot"->>'MaxSessions')::integer) OR ("OptionSnapshot"->>'Model' IN ('PerSession','FixedPackage','PeriodSubscription') AND "SelectedSessionCount" IS NULL)) IS TRUE);
                """);

        }
    }
}
