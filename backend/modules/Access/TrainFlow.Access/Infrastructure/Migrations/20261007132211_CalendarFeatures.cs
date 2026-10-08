using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CalendarFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE access.configurations SET \"GrantedFeatures\" = ARRAY(SELECT DISTINCT key FROM unnest(\"GrantedFeatures\" || ARRAY['calendar.events.manage','calendar.events.read-own','calendar.invitations.respond-own']::text[]) AS key ORDER BY key), \"Version\" = \"Version\" + 1 WHERE \"Id\" = 'v1-default';");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
