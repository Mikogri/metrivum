using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Metrivum.Offers.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DiscoveryReadIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_offers_PublishedCoachCard",
                schema: "offers",
                table: "offers",
                columns: new[] { "CoachId", "Id" },
                filter: "\"Status\" = 'Active' AND \"CurrentPublishedRevisionId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_offers_PublishedCoachCard",
                schema: "offers",
                table: "offers");
        }
    }
}
