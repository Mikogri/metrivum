using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinancialAuditGuards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE billing.orders ADD CONSTRAINT "CK_order_selected_sessions" CHECK ((("OptionSnapshot"->>'Model' = 'CustomPackage' AND "SelectedSessionCount" IS NOT NULL AND "SelectedSessionCount" BETWEEN ("OptionSnapshot"->>'MinSessions')::integer AND ("OptionSnapshot"->>'MaxSessions')::integer) OR ("OptionSnapshot"->>'Model' IN ('PerSession','FixedPackage','PeriodSubscription') AND "SelectedSessionCount" IS NULL)) IS TRUE);
                CREATE FUNCTION billing.protect_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
                BEGIN
                    IF TG_OP = 'DELETE' OR OLD."Status" <> 'Pending' THEN RAISE EXCEPTION 'Completed payment attempts are immutable' USING ERRCODE = '23514'; END IF;
                    IF NEW."DueId" <> OLD."DueId" OR NEW."IdempotencyKey" <> OLD."IdempotencyKey" OR NEW."PaymentMethodId" IS DISTINCT FROM OLD."PaymentMethodId" THEN RAISE EXCEPTION 'Attempt identity is immutable' USING ERRCODE = '23514'; END IF;
                    RETURN NEW;
                END $$;
                REVOKE ALL ON FUNCTION billing.protect_attempt() FROM PUBLIC;
                CREATE TRIGGER protect_payment_attempt BEFORE UPDATE OR DELETE ON billing.payment_attempts FOR EACH ROW EXECUTE FUNCTION billing.protect_attempt();
                ALTER TABLE billing.payment_attempts ADD CONSTRAINT "CK_attempt_state" CHECK (("Status" = 'Pending' AND "CompletedAt" IS NULL) OR ("Status" = 'Succeeded' AND "CompletedAt" IS NOT NULL AND "FailureCode" IS NULL AND "ProviderReference" IS NOT NULL) OR ("Status" = 'Failed' AND "CompletedAt" IS NOT NULL AND "FailureCode" IS NOT NULL));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE billing.orders DROP CONSTRAINT "CK_order_selected_sessions";
                ALTER TABLE billing.payment_attempts DROP CONSTRAINT "CK_attempt_state";
                DROP TRIGGER protect_payment_attempt ON billing.payment_attempts;
                DROP FUNCTION billing.protect_attempt();
                """);
        }
    }
}
