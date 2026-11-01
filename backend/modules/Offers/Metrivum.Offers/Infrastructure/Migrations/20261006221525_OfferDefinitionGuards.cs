using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class OfferDefinitionGuards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options",
                sql: "((\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options",
                sql: "((\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))) IS TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_shape",
                schema: "offers",
                table: "revision_billing_options",
                sql: "(\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_shape",
                schema: "offers",
                table: "billing_options",
                sql: "(\"Model\" = 'PerSession' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'CustomPackage' AND \"MinSessions\" >= 1 AND \"MaxSessions\" >= \"MinSessions\" AND \"SessionCount\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'FixedPackage' AND \"SessionCount\" >= 1 AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"PeriodCount\" IS NULL AND \"PeriodUnit\" IS NULL) OR (\"Model\" = 'PeriodSubscription' AND \"MinSessions\" IS NULL AND \"MaxSessions\" IS NULL AND \"SessionCount\" IS NULL AND ((\"PeriodUnit\" = 'Week' AND \"PeriodCount\" BETWEEN 1 AND 52) OR (\"PeriodUnit\" = 'Month' AND \"PeriodCount\" BETWEEN 1 AND 12) OR (\"PeriodUnit\" = 'Year' AND \"PeriodCount\" = 1)))");
        }
    }
}
