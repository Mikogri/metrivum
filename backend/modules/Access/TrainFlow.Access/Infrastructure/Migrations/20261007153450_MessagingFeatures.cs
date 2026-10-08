using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MessagingFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE access.configurations SET \"GrantedFeatures\" = ARRAY(SELECT DISTINCT key FROM unnest(\"GrantedFeatures\" || ARRAY['messaging.direct','messaging.groups','messaging.group.manage','messaging.attachments','messaging.voice','messaging.report']::text[]) AS key ORDER BY key), \"Version\" = \"Version\" + 1 WHERE \"Id\" = 'v1-default';");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
