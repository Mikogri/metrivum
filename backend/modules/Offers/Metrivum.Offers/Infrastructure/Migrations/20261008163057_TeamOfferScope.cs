using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TeamOfferScope : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "offers",
                table: "revisions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamName",
                schema: "offers",
                table: "revisions",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TeamId",
                schema: "offers",
                table: "offers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamName",
                schema: "offers",
                table: "offers",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_offers_TeamId_Status_UpdatedAt",
                schema: "offers",
                table: "offers",
                columns: new[] { "TeamId", "Status", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_offers_TeamId_Status_UpdatedAt",
                schema: "offers",
                table: "offers");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "offers",
                table: "revisions");

            migrationBuilder.DropColumn(
                name: "TeamName",
                schema: "offers",
                table: "revisions");

            migrationBuilder.DropColumn(
                name: "TeamId",
                schema: "offers",
                table: "offers");

            migrationBuilder.DropColumn(
                name: "TeamName",
                schema: "offers",
                table: "offers");
        }
    }
}
