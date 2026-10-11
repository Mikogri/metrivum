using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SessionValidity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ValidityDays",
                schema: "offers",
                table: "revision_billing_options",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ValidityDays",
                schema: "offers",
                table: "billing_options",
                type: "integer",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" <> 'PeriodSubscription')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options",
                sql: "\"ValidityDays\" IS NULL OR (\"ValidityDays\" BETWEEN 1 AND 36500 AND \"Model\" <> 'PeriodSubscription')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_option_validity",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropCheckConstraint(
                name: "CK_option_validity",
                schema: "offers",
                table: "billing_options");

            migrationBuilder.DropColumn(
                name: "ValidityDays",
                schema: "offers",
                table: "revision_billing_options");

            migrationBuilder.DropColumn(
                name: "ValidityDays",
                schema: "offers",
                table: "billing_options");
        }
    }
}
