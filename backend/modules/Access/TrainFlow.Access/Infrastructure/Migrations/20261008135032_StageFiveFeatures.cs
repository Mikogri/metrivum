using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Access.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageFiveFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE access.configurations
                SET "GrantedFeatures" = ARRAY(SELECT DISTINCT key FROM unnest("GrantedFeatures" || ARRAY[
                    'training.assignments.manage','training.executions.log-own','training.executions.review',
                    'training.progress.view-own','training.progress.view-clients','training.generator.use',
                    'coaching.documentation.manage','coaching.documentation.view-shared']::text[]) AS key ORDER BY key),
                    "Version" = "Version" + 1
                WHERE "Id" = 'v1-default';
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
