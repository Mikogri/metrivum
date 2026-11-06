using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.CheckIns.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ScheduleStatusIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Schedules_Status",
                schema: "checkins",
                table: "Schedules",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Schedules_Status",
                schema: "checkins",
                table: "Schedules");
        }
    }
}
