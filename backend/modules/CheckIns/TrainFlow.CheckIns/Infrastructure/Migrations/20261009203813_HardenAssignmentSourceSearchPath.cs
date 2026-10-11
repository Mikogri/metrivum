using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class HardenAssignmentSourceSearchPath : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER FUNCTION checkins.protect_assignment_source() SET search_path = pg_catalog;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER FUNCTION checkins.protect_assignment_source() RESET search_path;");
        }
    }
}
