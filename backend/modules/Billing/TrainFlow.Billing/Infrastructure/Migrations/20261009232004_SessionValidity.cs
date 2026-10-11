using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SessionValidity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE OR REPLACE FUNCTION billing.protect_due() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
                DECLARE excluded text[] := ARRAY['ValidUntil','Status','SettledAt','SettledBy','SettlementSource','FeeRate','FeeAmount','CoachNetAmount','SettlementMode'];
                BEGIN
                    IF TG_OP='DELETE' OR OLD."Status" <> 'AwaitingPayment' THEN RAISE EXCEPTION 'Settled dues are immutable' USING ERRCODE='23514'; END IF;
                    IF OLD."Context"='Platform' THEN excluded := excluded || ARRAY['PeriodStart','PeriodEnd']; END IF;
                    IF (to_jsonb(NEW)-excluded) IS DISTINCT FROM (to_jsonb(OLD)-excluded) THEN
                        RAISE EXCEPTION 'Due identity and gross terms are immutable' USING ERRCODE='23514';
                    END IF;
                    RETURN NEW;
                END $$;
                """);
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ValidUntil",
                schema: "billing",
                table: "payment_dues",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ValidityDays",
                schema: "billing",
                table: "payment_dues",
                type: "integer",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_due_validity",
                schema: "billing",
                table: "payment_dues",
                sql: "(\"ValidityDays\" IS NULL AND \"ValidUntil\" IS NULL) OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND ((\"SettledAt\" IS NULL AND \"ValidUntil\" IS NULL) OR (\"SettledAt\" IS NOT NULL AND \"ValidUntil\" = \"SettledAt\" + \"ValidityDays\" * interval '24 hours'))) IS TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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
            migrationBuilder.DropCheckConstraint(
                name: "CK_due_validity",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "ValidUntil",
                schema: "billing",
                table: "payment_dues");

            migrationBuilder.DropColumn(
                name: "ValidityDays",
                schema: "billing",
                table: "payment_dues");
        }
    }
}
