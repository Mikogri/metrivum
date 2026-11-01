using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PlanSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                schema: "offers",
                table: "revisions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CoachingService");

            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                schema: "offers",
                table: "offers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "CoachingService");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options",
                sql: "((\"Model\" IN ('PerSession','OneTime') AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" NOT IN ('PeriodSubscription','OneTime'))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options",
                sql: "((\"Model\" IN ('PerSession','OneTime') AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" NOT IN ('PeriodSubscription','OneTime'))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.DropColumn(
                name: "Purpose",
                schema: "offers",
                table: "revisions");

            migrationBuilder.DropColumn(
                name: "Purpose",
                schema: "offers",
                table: "offers");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options",
                sql: "((\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" <> 'PeriodSubscription')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options",
                sql: "((\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" <> 'PeriodSubscription')");
        }
    }
}
