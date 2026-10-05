using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Training.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class HardenImmutableTriggerSearchPath : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER FUNCTION training.reject_immutable_change() SET search_path = '';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER FUNCTION training.reject_immutable_change() RESET search_path;");
        }
    }
}
