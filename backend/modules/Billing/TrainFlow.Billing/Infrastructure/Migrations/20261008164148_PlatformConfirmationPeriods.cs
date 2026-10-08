using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlatformConfirmationPeriods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION billing.protect_due() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
                DECLARE excluded text[] := ARRAY['Status','SettledAt','SettledBy','SettlementSource','FeeRate','FeeAmount','CoachNetAmount','SettlementMode'];
                BEGIN
                    IF TG_OP='DELETE' OR OLD."Status" <> 'AwaitingPayment' THEN RAISE EXCEPTION 'Settled dues are immutable' USING ERRCODE='23514'; END IF;
                    IF OLD."Context"='Platform' THEN excluded := excluded || ARRAY['PeriodStart','PeriodEnd']; END IF;
                    IF (to_jsonb(NEW)-excluded) IS DISTINCT FROM (to_jsonb(OLD)-excluded) THEN
                        RAISE EXCEPTION 'Due identity and gross terms are immutable' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END $$;
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION billing.protect_due() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
                BEGIN
                    IF TG_OP='DELETE' OR OLD."Status" <> 'AwaitingPayment' THEN RAISE EXCEPTION 'Settled dues are immutable' USING ERRCODE='23514'; END IF;
                    IF (to_jsonb(NEW)-ARRAY['Status','SettledAt','SettledBy','SettlementSource','FeeRate','FeeAmount','CoachNetAmount','SettlementMode'])
                       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['Status','SettledAt','SettledBy','SettlementSource','FeeRate','FeeAmount','CoachNetAmount','SettlementMode']) THEN
                        RAISE EXCEPTION 'Due identity and gross terms are immutable' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END $$;
                """);

        }
    }
}
