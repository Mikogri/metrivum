using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Coaching.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CoachShowcaseCover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CoverMediaId",
                schema: "coaching",
                table: "Showcases",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoverMediaId",
                schema: "coaching",
                table: "Showcases");
        }
    }
}
