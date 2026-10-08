using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamCalendarScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "calendar",
                table: "Events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_TeamId_StartsAtUtc_Id",
                schema: "calendar",
                table: "Events",
                columns: new[] { "TeamId", "StartsAtUtc", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Events_TeamId_StartsAtUtc_Id",
                schema: "calendar",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "calendar",
                table: "Events");
        }
    }
}
