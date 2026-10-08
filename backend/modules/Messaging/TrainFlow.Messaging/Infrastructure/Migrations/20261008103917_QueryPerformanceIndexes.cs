using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TrainFlow.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class QueryPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Requests_SenderUserId_CreatedAt",
                schema: "messaging",
                table: "Requests",
                columns: new[] { "SenderUserId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Requests_SenderUserId_CreatedAt",
                schema: "messaging",
                table: "Requests");
        }
    }
}
