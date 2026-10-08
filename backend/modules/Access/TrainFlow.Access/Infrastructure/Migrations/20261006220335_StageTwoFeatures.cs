using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageTwoFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" || ARRAY[
                    'offers.manage', 'offers.view-public', 'forms.application.manage', 'forms.checkin.manage',
                    'coaching.applications.submit-own', 'coaching.applications.manage',
                    'coaching.invitations.send', 'coaching.invitations.respond-own',
                    'coaching.services.read-own', 'coaching.services.manage',
                    'checkins.schedules.manage', 'checkins.respond-own', 'checkins.review',
                    'billing.manage', 'billing.read-own', 'billing.pay-own']::text[]) AS key ORDER BY key),
                    "Version" = "Version" + 1
                WHERE "Id" = 'v1-default';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Preserve operator grants because they cannot be distinguished from appended defaults.
        }
    }
}
